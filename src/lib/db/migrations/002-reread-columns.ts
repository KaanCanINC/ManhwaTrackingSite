import type { Migration } from "./types";
import { tableColumns } from "./utils";

export const migration002RereadColumns: Migration = {
  version: 2,
  run(db) {
    const names = tableColumns(db, "series");

    if (!names.has("total_rereads")) {
      db.exec("ALTER TABLE series ADD COLUMN total_rereads INTEGER NOT NULL DEFAULT 0;");
    }

    if (!names.has("reread_sessions")) {
      db.exec("ALTER TABLE series ADD COLUMN reread_sessions TEXT NOT NULL DEFAULT '[]';");
    }
  },
};
