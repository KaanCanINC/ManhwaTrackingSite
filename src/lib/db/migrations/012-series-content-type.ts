import type { Migration } from "./types";
import { tableColumns } from "./utils";

export const migration012SeriesContentType: Migration = {
  version: 12,
  run(db) {
    const seriesNames = tableColumns(db, "series");

    if (!seriesNames.has("content_type")) {
      db.exec("ALTER TABLE series ADD COLUMN content_type TEXT;");
    }
  },
};
