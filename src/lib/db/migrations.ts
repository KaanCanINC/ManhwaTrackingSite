import type Database from "better-sqlite3";
import { migrations } from "./migrations/registry";

let migrated = false;

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      executed_at TEXT NOT NULL
    );
  `);
}

function currentVersion(db: Database.Database): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations")
    .get() as { version: number };
  return row.version;
}

function markExecuted(db: Database.Database, version: number): void {
  db.prepare("INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)").run(
    version,
    new Date().toISOString(),
  );
}

export function runMigrations(db: Database.Database): void {
  if (migrated) {
    return;
  }

  ensureMigrationsTable(db);

  let version = currentVersion(db);
  for (const migration of migrations) {
    if (migration.version <= version) {
      continue;
    }

    migration.run(db);
    markExecuted(db, migration.version);
    version = migration.version;
  }

  migrated = true;
}
