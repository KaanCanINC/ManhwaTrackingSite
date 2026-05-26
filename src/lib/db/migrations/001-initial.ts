import type { Migration } from "./types";

export const migration001Initial: Migration = {
  version: 1,
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        total_chapters INTEGER NOT NULL DEFAULT 0,
        chapters_read INTEGER NOT NULL DEFAULT 0,
        start_date TEXT,
        finish_date TEXT,
        rating INTEGER,
        description TEXT NOT NULL DEFAULT '',
        personal_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'plan_to_read',
        reread INTEGER NOT NULL DEFAULT 0,
        total_rereads INTEGER NOT NULL DEFAULT 0,
        reread_sessions TEXT NOT NULL DEFAULT '[]',
        novel_to_read INTEGER NOT NULL DEFAULT 0,
        follow_updates INTEGER NOT NULL DEFAULT 0,
        cover_image_blob BLOB,
        cover_image_mime_type TEXT,
        cover_image_fetched_at TEXT,
        metadata_fetched_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS series_sources (
        id TEXT PRIMARY KEY,
        series_id TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT NOT NULL,
        site TEXT,
        canonical_id TEXT,
        scraped_at TEXT,
        scraper_name TEXT,
        last_error TEXT,
        meta TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        file_name TEXT NOT NULL,
        added INTEGER NOT NULL,
        merged INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  },
};
