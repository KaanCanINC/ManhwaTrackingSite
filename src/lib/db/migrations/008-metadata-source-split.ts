import type { Migration } from "./types";
import { tableColumns } from "./utils";

export const migration008MetadataSourceSplit: Migration = {
  version: 8,
  run(db) {
    const seriesNames = tableColumns(db, "series");

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
  },
};
