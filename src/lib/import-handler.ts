import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import type { ImportSeriesInput } from "@/lib/importers/mal";
import { batchMergeSeriesByTitle } from "@/lib/series-repository";
import { dataPaths } from "@/lib/storage";

export function runImport(
  source: "mal" | "anilist" | "website",
  content: string,
  parser: (content: string) => ImportSeriesInput[],
  fileExtension: string,
  mergeStrategy: (items: ImportSeriesInput[]) => { added: number; merged: number } = batchMergeSeriesByTitle,
): { added: number; merged: number; fileName: string } {
  const fileName = `import-${source}-${Date.now()}.${fileExtension}`;
  const fullPath = path.join(dataPaths.importsDir, fileName);
  fs.writeFileSync(fullPath, content, "utf8");

  const items = parser(content);
  const { added, merged } = mergeStrategy(items);

  getDb()
    .prepare("INSERT INTO imports (id, source, file_name, added, merged, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), source, fileName, added, merged, new Date().toISOString());

  return { added, merged, fileName };
}
