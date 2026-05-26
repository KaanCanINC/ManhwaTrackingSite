import type Database from "better-sqlite3";

export type Migration = {
  version: number;
  run: (db: Database.Database) => void;
};
