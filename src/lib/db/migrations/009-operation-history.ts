import type { Migration } from "./types";

export const migration009OperationHistory: Migration = {
  version: 9,
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS operation_history (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        undo_payload_json TEXT,
        created_at TEXT NOT NULL,
        undone_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_operation_history_created_at
        ON operation_history(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_operation_history_entity
        ON operation_history(entity_type, entity_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_operation_history_undone
        ON operation_history(undone_at);
    `);
  },
};
