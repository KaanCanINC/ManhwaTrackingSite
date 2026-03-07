import type Database from "better-sqlite3";

let migrated = false;

export function runMigrations(db: Database.Database): void {
  if (migrated) {
    return;
  }


  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      executed_at TEXT NOT NULL
    );
  `);

  const version = db
    .prepare("SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations")
    .get() as { version: number };

  if (version.version < 1) {
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

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(1, new Date().toISOString());
  }

  if (version.version < 2) {
    const columns = db
      .prepare("PRAGMA table_info(series)")
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    if (!names.has("total_rereads")) {
      db.exec("ALTER TABLE series ADD COLUMN total_rereads INTEGER NOT NULL DEFAULT 0;");
    }

    if (!names.has("reread_sessions")) {
      db.exec("ALTER TABLE series ADD COLUMN reread_sessions TEXT NOT NULL DEFAULT '[]';");
    }

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(2, new Date().toISOString());
  }

  if (version.version < 3) {
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
    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(3, new Date().toISOString());
  }

  if (version.version < 4) {
    const seriesColumns = db
      .prepare("PRAGMA table_info(series)")
      .all() as Array<{ name: string }>;
    const seriesNames = new Set(seriesColumns.map((column) => column.name));

    if (!seriesNames.has("description")) {
      db.exec("ALTER TABLE series ADD COLUMN description TEXT NOT NULL DEFAULT '';\n");
    }
    if (!seriesNames.has("cover_image_blob")) {
      db.exec("ALTER TABLE series ADD COLUMN cover_image_blob BLOB;");
    }
    if (!seriesNames.has("cover_image_mime_type")) {
      db.exec("ALTER TABLE series ADD COLUMN cover_image_mime_type TEXT;");
    }
    if (!seriesNames.has("cover_image_fetched_at")) {
      db.exec("ALTER TABLE series ADD COLUMN cover_image_fetched_at TEXT;");
    }
    if (!seriesNames.has("metadata_fetched_at")) {
      db.exec("ALTER TABLE series ADD COLUMN metadata_fetched_at TEXT;");
    }

    const sourceColumns = db
      .prepare("PRAGMA table_info(series_sources)")
      .all() as Array<{ name: string }>;
    const sourceNames = new Set(sourceColumns.map((column) => column.name));

    if (!sourceNames.has("site")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN site TEXT;");
    }
    if (!sourceNames.has("canonical_id")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN canonical_id TEXT;");
    }
    if (!sourceNames.has("scraped_at")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN scraped_at TEXT;");
    }
    if (!sourceNames.has("scraper_name")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN scraper_name TEXT;");
    }
    if (!sourceNames.has("last_error")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN last_error TEXT;");
    }
    if (!sourceNames.has("meta")) {
      db.exec("ALTER TABLE series_sources ADD COLUMN meta TEXT;");
    }

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(4, new Date().toISOString());
  }

  if (version.version < 5) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_series_sources_site_canonical
        ON series_sources(site, canonical_id);
      CREATE INDEX IF NOT EXISTS idx_series_sources_site
        ON series_sources(site);
    `);
    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(5, new Date().toISOString());
  }

  if (version.version < 6) {
    const seriesColumns = db
      .prepare("PRAGMA table_info(series)")
      .all() as Array<{ name: string }>;
    const seriesNames = new Set(seriesColumns.map((column) => column.name));

    if (!seriesNames.has("preferred_source_type")) {
      db.exec("ALTER TABLE series ADD COLUMN preferred_source_type TEXT;");
    }

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(6, new Date().toISOString());
  }

  if (version.version < 7) {
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

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(7, new Date().toISOString());
  }

  if (version.version < 8) {
    const seriesColumns = db
      .prepare("PRAGMA table_info(series)")
      .all() as Array<{ name: string }>;
    const seriesNames = new Set(seriesColumns.map((column) => column.name));

    if (!seriesNames.has("metadata_source_url")) {
      db.exec("ALTER TABLE series ADD COLUMN metadata_source_url TEXT;");
    }
    if (!seriesNames.has("metadata_source_site")) {
      db.exec("ALTER TABLE series ADD COLUMN metadata_source_site TEXT;");
    }
    if (!seriesNames.has("metadata_source_canonical_id")) {
      db.exec("ALTER TABLE series ADD COLUMN metadata_source_canonical_id TEXT;");
    }
    if (!seriesNames.has("metadata_source_updated_at")) {
      db.exec("ALTER TABLE series ADD COLUMN metadata_source_updated_at TEXT;");
    }

    const providerRows = db
      .prepare(
        `SELECT series_id, site, canonical_id, url, scraped_at, created_at
         FROM series_sources
         WHERE site IN ('myanimelist', 'anilist')
         ORDER BY created_at DESC`,
      )
      .all() as Array<{
        series_id: string;
        site: "myanimelist" | "anilist";
        canonical_id: string | null;
        url: string;
        scraped_at: string | null;
        created_at: string;
      }>;

    const seenSeries = new Set<string>();
    const updateSeriesMetadata = db.prepare(
      `UPDATE series
       SET metadata_source_url = ?,
           metadata_source_site = ?,
           metadata_source_canonical_id = ?,
           metadata_source_updated_at = ?
       WHERE id = ?`,
    );

    const tx = db.transaction(() => {
      for (const row of providerRows) {
        if (seenSeries.has(row.series_id)) {
          continue;
        }
        seenSeries.add(row.series_id);
        updateSeriesMetadata.run(
          row.url,
          row.site,
          row.canonical_id,
          row.scraped_at ?? row.created_at,
          row.series_id,
        );
      }

      db.prepare("DELETE FROM series_sources WHERE site IN ('myanimelist', 'anilist')").run();
    });

    tx();

    db.prepare(
      "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
    ).run(8, new Date().toISOString());
  }

  migrated = true;
}
