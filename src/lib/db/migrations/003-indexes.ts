import type { Migration } from "./types";

export const migration003Indexes: Migration = {
  version: 3,
  run(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_series_sources_series_id
        ON series_sources(series_id);
      CREATE INDEX IF NOT EXISTS idx_series_updated_at
        ON series(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_backups_reason_created_at
        ON backups(reason, created_at);
      CREATE INDEX IF NOT EXISTS idx_series_lower_title
        ON series(LOWER(title));
    `);
  },
};
