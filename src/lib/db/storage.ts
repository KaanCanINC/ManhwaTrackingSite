import fs from "node:fs";
import path from "node:path";

function resolveDir(override: string | undefined, fallback: string): string {
  const raw = override?.trim();
  return raw ? path.resolve(raw) : path.resolve(fallback);
}

const dataRoot = resolveDir(process.env.DATA_DIR, path.join(process.cwd(), "data"));

export const dataPaths = {
  root: dataRoot,
  databaseDir: resolveDir(process.env.DB_DIR, path.join(dataRoot, "database")),
  backupsDir: resolveDir(process.env.BACKUPS_DIR, path.join(dataRoot, "backups")),
  importsDir: resolveDir(process.env.IMPORTS_DIR, path.join(dataRoot, "imports")),
};

export function ensureDataDirs(): void {
  fs.mkdirSync(dataPaths.databaseDir, { recursive: true });
  fs.mkdirSync(dataPaths.backupsDir, { recursive: true });
  fs.mkdirSync(dataPaths.importsDir, { recursive: true });
}
