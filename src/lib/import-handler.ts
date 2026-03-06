import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import type { ImportSeriesInput } from "@/lib/importers/mal";
import { enrichImportedItems } from "@/lib/import-metadata";
import { batchMergeSeriesByTitle } from "@/lib/series-repository";
import { dataPaths } from "@/lib/storage";

export type ImportPreviewItem = {
  index: number;
  title: string;
  status: string;
  totalChapters: number;
  chaptersRead: number;
};

type RunImportOptions = {
  selectedIndices?: number[];
};

function filterBySelection(items: ImportSeriesInput[], selectedIndices: number[] | undefined): ImportSeriesInput[] {
  if (!selectedIndices || selectedIndices.length === 0) {
    return items;
  }
  const selected = new Set(selectedIndices);
  return items.filter((_, index) => selected.has(index));
}

export function getImportPreview(content: string, parser: (content: string) => ImportSeriesInput[]): ImportPreviewItem[] {
  const items = parser(content);
  return items.map((item, index) => ({
    index,
    title: item.title,
    status: item.status,
    totalChapters: item.totalChapters,
    chaptersRead: item.chaptersRead,
  }));
}

export async function runImport(
  source: "mal" | "anilist" | "website",
  content: string,
  parser: (content: string) => ImportSeriesInput[],
  fileExtension: string,
  mergeStrategy: (items: ImportSeriesInput[]) => { added: number; merged: number } = batchMergeSeriesByTitle,
  options: RunImportOptions = {},
): Promise<{ added: number; merged: number; fileName: string }> {
  const fileName = `import-${source}-${Date.now()}.${fileExtension}`;
  const fullPath = path.join(dataPaths.importsDir, fileName);
  fs.writeFileSync(fullPath, content, "utf8");

  const parsedItems = parser(content);
  const selectedItems = filterBySelection(parsedItems, options.selectedIndices);
  const items =
    source === "mal" || source === "anilist"
      ? await enrichImportedItems(source, selectedItems)
      : selectedItems;

  const { added, merged } = mergeStrategy(items);

  getDb()
    .prepare("INSERT INTO imports (id, source, file_name, added, merged, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), source, fileName, added, merged, new Date().toISOString());

  return { added, merged, fileName };
}
