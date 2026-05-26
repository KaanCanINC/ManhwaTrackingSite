import type { Migration } from "./types";

export const migration010SavedViews: Migration = {
  version: 10,
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        query_json TEXT,
        sort_json TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_items (
        collection_id TEXT NOT NULL,
        series_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (collection_id, series_id),
        FOREIGN KEY(collection_id) REFERENCES saved_views(id) ON DELETE CASCADE,
        FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_saved_views_pinned_updated
        ON saved_views(pinned DESC, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_collection_items_collection_order
        ON collection_items(collection_id, order_index ASC);
    `);
  },
};
