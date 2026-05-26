import type { Migration } from "./types";

export const migration007EnrichmentJobs: Migration = {
  version: 7,
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_enrichment_jobs (
        id TEXT PRIMARY KEY,
        series_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_import_enrichment_jobs_status_retry
        ON import_enrichment_jobs(status, next_retry_at, created_at);

      CREATE INDEX IF NOT EXISTS idx_import_enrichment_jobs_series_source
        ON import_enrichment_jobs(series_id, source);
    `);
  },
};
