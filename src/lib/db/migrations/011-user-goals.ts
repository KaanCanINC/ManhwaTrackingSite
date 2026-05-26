import type { Migration } from "./types";

export const migration011UserGoals: Migration = {
  version: 11,
  run(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_goals (
        id TEXT PRIMARY KEY,
        period_type TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        target_value INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_goals_period_metric
        ON user_goals(period_type, metric_type);
    `);
  },
};
