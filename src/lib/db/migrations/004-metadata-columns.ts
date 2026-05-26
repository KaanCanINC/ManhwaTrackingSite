import type { Migration } from "./types";
import { tableColumns } from "./utils";

export const migration004MetadataColumns: Migration = {
  version: 4,
  run(db) {
    const seriesNames = tableColumns(db, "series");

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

    const sourceNames = tableColumns(db, "series_sources");

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
  },
};
