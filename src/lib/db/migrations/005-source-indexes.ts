import type { Migration } from "./types";

export const migration005SourceIndexes: Migration = {
  version: 5,
  run(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_series_sources_site_canonical
        ON series_sources(site, canonical_id);
      CREATE INDEX IF NOT EXISTS idx_series_sources_site
        ON series_sources(site);
    `);
  },
};
