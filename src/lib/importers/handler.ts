import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { enqueueImportEnrichmentJobs } from "@/lib/enrichment/queue";
import type { ImportSeriesInput } from "./mal";
import { batchMergeSeriesByTitle, mergeSeriesByTitle } from "@/lib/series-repository";
import { dataPaths } from "@/lib/db/storage";

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

type ImportSource = "mal" | "anilist" | "website";

function filterBySelection(items: ImportSeriesInput[], selectedIndices: number[] | undefined): ImportSeriesInput[] {
  if (!selectedIndices || selectedIndices.length === 0) {
    return items;
  }
  const selected = new Set(selectedIndices);
  return items.filter((_, index) => selected.has(index));
}

export function getImportPreviewFromItems(items: ImportSeriesInput[]): ImportPreviewItem[] {
  return items.map((item, index) => ({
    index,
    title: item.title,
    status: item.status,
    totalChapters: item.totalChapters,
    chaptersRead: item.chaptersRead,
  }));
}

export function getImportPreview(content: string, parser: (content: string) => ImportSeriesInput[]): ImportPreviewItem[] {
  return getImportPreviewFromItems(parser(content));
}

type RunImportCoreArgs = {
  source: ImportSource;
  fileExtension: string;
  rawContent: string;
  selectedItems: ImportSeriesInput[];
  mergeStrategy: (items: ImportSeriesInput[]) => { added: number; merged: number };
};

async function runImportCore({
  source,
  fileExtension,
  rawContent,
  selectedItems,
  mergeStrategy,
}: RunImportCoreArgs): Promise<{ added: number; merged: number; fileName: string; queuedEnrichment: number }> {
  const fileName = `import-${source}-${Date.now()}.${fileExtension}`;
  const fullPath = path.join(dataPaths.importsDir, fileName);
  fs.writeFileSync(fullPath, rawContent, "utf8");

  let added = 0;
  let merged = 0;
  let queuedEnrichment = 0;

  if (source === "mal" || source === "anilist") {
    const touchedSeriesIds: string[] = [];

    for (const item of selectedItems) {
      const result = mergeSeriesByTitle(item);
      touchedSeriesIds.push(result.series.id);
      if (result.type === "added") added += 1;
      else merged += 1;
    }

    queuedEnrichment = enqueueImportEnrichmentJobs(source, touchedSeriesIds);
  } else {
    const mergedResult = mergeStrategy(selectedItems);
    added = mergedResult.added;
    merged = mergedResult.merged;
  }

  getDb()
    .prepare("INSERT INTO imports (id, source, file_name, added, merged, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), source, fileName, added, merged, new Date().toISOString());

  return { added, merged, fileName, queuedEnrichment };
}

export async function runImport(
  source: ImportSource,
  content: string,
  parser: (content: string) => ImportSeriesInput[],
  fileExtension: string,
  mergeStrategy: (items: ImportSeriesInput[]) => { added: number; merged: number } = batchMergeSeriesByTitle,
  options: RunImportOptions = {},
): Promise<{ added: number; merged: number; fileName: string; queuedEnrichment: number }> {
  const parsedItems = parser(content);
  const selectedItems = filterBySelection(parsedItems, options.selectedIndices);

  return await runImportCore({
    source,
    fileExtension,
    rawContent: content,
    selectedItems,
    mergeStrategy,
  });
}

export async function runImportFromItems(
  source: ImportSource,
  items: ImportSeriesInput[],
  fileExtension: string,
  mergeStrategy: (items: ImportSeriesInput[]) => { added: number; merged: number } = batchMergeSeriesByTitle,
  options: RunImportOptions = {},
): Promise<{ added: number; merged: number; fileName: string; queuedEnrichment: number }> {
  const selectedItems = filterBySelection(items, options.selectedIndices);
  return await runImportCore({
    source,
    fileExtension,
    rawContent: JSON.stringify(items),
    selectedItems,
    mergeStrategy,
  });
}
