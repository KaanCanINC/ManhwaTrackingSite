import fs from "node:fs";
import path from "node:path";

const dataRoot = process.env.DATA_DIR || path.join(process.cwd(), "data");

export const dataPaths = {
  root: dataRoot,
  databaseDir: path.join(dataRoot, "database"),
  backupsDir: path.join(dataRoot, "backups"),
  importsDir: path.join(dataRoot, "imports"),
};

export function ensureDataDirs(): void {
  fs.mkdirSync(dataPaths.databaseDir, { recursive: true });
  fs.mkdirSync(dataPaths.backupsDir, { recursive: true });
  fs.mkdirSync(dataPaths.importsDir, { recursive: true });
}
