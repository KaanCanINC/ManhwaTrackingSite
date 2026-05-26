import type { Migration } from "./types";
import { tableColumns } from "./utils";

export const migration006PreferredSource: Migration = {
  version: 6,
  run(db) {
    const seriesNames = tableColumns(db, "series");

    if (!seriesNames.has("preferred_source_type")) {
      db.exec("ALTER TABLE series ADD COLUMN preferred_source_type TEXT;");
    }
  },
};
