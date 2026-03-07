import path from "node:path";
import Database from "better-sqlite3";
import { ensureDataDirs, dataPaths } from "./storage";
import { runMigrations } from "./migrations";

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDataDirs();
  const dbPath = path.join(dataPaths.databaseDir, "tracker.sqlite");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  dbInstance.pragma("busy_timeout = 5000");
  runMigrations(dbInstance);
  return dbInstance;
}
