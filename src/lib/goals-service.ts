import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";

export type GoalMetricType =
  | "weekly_chapter_goal"
  | "monthly_chapter_goal"
  | "monthly_completed_goal";

export type GoalPeriodType = "week" | "month";

export type GoalConfig = {
  id: string;
  periodType: GoalPeriodType;
  metricType: GoalMetricType;
  targetValue: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

export type GoalProgressSummary = {
  metricType: GoalMetricType;
  periodType: GoalPeriodType;
  targetValue: number;
  actualValue: number;
  remainingValue: number;
  percent: number;
  trendLast4Avg: number;
  estimatedFinishDate: string | null;
};

const createGoalSchema = z.object({
  periodType: z.enum(["week", "month"]),
  metricType: z.enum([
    "weekly_chapter_goal",
    "monthly_chapter_goal",
    "monthly_completed_goal",
  ]),
  targetValue: z.number().int().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const updateGoalSchema = z.object({
  targetValue: z.number().int().min(1).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

type GoalRow = {
  id: string;
  period_type: GoalPeriodType;
  metric_type: GoalMetricType;
  target_value: number;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

function mapGoalRow(row: GoalRow): GoalConfig {
  return {
    id: row.id,
    periodType: row.period_type,
    metricType: row.metric_type,
    targetValue: row.target_value,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseSnapshot(raw: string | null):
  | {
      series?: {
        chaptersRead?: number;
        status?: string;
      };
    }
  | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as {
      series?: {
        chaptersRead?: number;
        status?: string;
      };
    };
  } catch {
    return null;
  }
}

function getChapterDeltaAndCompletedCount(startIso: string, endIso: string): {
  chapterDelta: number;
  completedCount: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT action_type, before_json, after_json
       FROM operation_history
       WHERE created_at >= ? AND created_at <= ?
         AND action_type IN ('update_chapters_read', 'update_series')`,
    )
    .all(startIso, endIso) as Array<{
      action_type: string;
      before_json: string | null;
      after_json: string | null;
    }>;

  let chapterDelta = 0;
  let completedCount = 0;

  for (const row of rows) {
    const before = parseSnapshot(row.before_json);
    const after = parseSnapshot(row.after_json);

    const beforeChapters = Number(before?.series?.chaptersRead ?? 0);
    const afterChapters = Number(after?.series?.chaptersRead ?? 0);
    const delta = afterChapters - beforeChapters;
    if (Number.isFinite(delta) && delta > 0) {
      chapterDelta += delta;
    }

    const beforeStatus = before?.series?.status ?? null;
    const afterStatus = after?.series?.status ?? null;
    if (beforeStatus !== "completed" && afterStatus === "completed") {
      completedCount += 1;
    }
  }

  return { chapterDelta, completedCount };
}

function getLast4WeeksAverageChapterDelta(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let total = 0;
  for (let i = 0; i < 4; i += 1) {
    const periodEnd = new Date(end);
    periodEnd.setDate(end.getDate() - i * 7);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodEnd.getDate() - 6);
    periodStart.setHours(0, 0, 0, 0);

    const metrics = getChapterDeltaAndCompletedCount(
      periodStart.toISOString(),
      periodEnd.toISOString(),
    );
    total += metrics.chapterDelta;
  }

  return total / 4;
}

export function listGoals(): GoalConfig[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, period_type, metric_type, target_value, start_date, end_date, created_at, updated_at
       FROM user_goals
       ORDER BY created_at DESC`,
    )
    .all() as GoalRow[];

  return rows.map(mapGoalRow);
}

export function createGoal(payload: unknown): GoalConfig {
  const input = createGoalSchema.parse(payload);
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO user_goals
     (id, period_type, metric_type, target_value, start_date, end_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.periodType,
    input.metricType,
    input.targetValue,
    input.startDate,
    input.endDate,
    now,
    now,
  );

  return {
    id,
    periodType: input.periodType,
    metricType: input.metricType,
    targetValue: input.targetValue,
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateGoal(id: string, payload: unknown): GoalConfig | null {
  const input = updateGoalSchema.parse(payload);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, period_type, metric_type, target_value, start_date, end_date, created_at, updated_at
       FROM user_goals
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as GoalRow | undefined;

  if (!row) {
    return null;
  }

  const next = {
    targetValue: input.targetValue ?? row.target_value,
    startDate: input.startDate ?? row.start_date,
    endDate: input.endDate ?? row.end_date,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE user_goals
     SET target_value = ?, start_date = ?, end_date = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.targetValue, next.startDate, next.endDate, next.updatedAt, id);

  return {
    id: row.id,
    periodType: row.period_type,
    metricType: row.metric_type,
    targetValue: next.targetValue,
    startDate: next.startDate,
    endDate: next.endDate,
    createdAt: row.created_at,
    updatedAt: next.updatedAt,
  };
}

export function deleteGoal(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM user_goals WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getGoalsSummary(): {
  weeklyChapter: GoalProgressSummary | null;
  monthlyChapter: GoalProgressSummary | null;
  monthlyCompleted: GoalProgressSummary | null;
} {
  const goals = listGoals();

  function buildSummary(metricType: GoalMetricType): GoalProgressSummary | null {
    const goal = goals.find((entry) => entry.metricType === metricType);
    if (!goal) {
      return null;
    }

    const metrics = getChapterDeltaAndCompletedCount(goal.startDate, goal.endDate);
    const actualValue =
      metricType === "monthly_completed_goal"
        ? metrics.completedCount
        : metrics.chapterDelta;

    const remainingValue = Math.max(0, goal.targetValue - actualValue);
    const percent = goal.targetValue > 0 ? Math.min(100, (actualValue / goal.targetValue) * 100) : 0;

    const trendLast4Avg =
      metricType === "monthly_completed_goal" ? 0 : getLast4WeeksAverageChapterDelta();

    let estimatedFinishDate: string | null = null;
    if (metricType !== "monthly_completed_goal" && trendLast4Avg > 0 && remainingValue > 0) {
      const daysNeeded = Math.ceil((remainingValue / trendLast4Avg) * 7);
      const eta = new Date();
      eta.setDate(eta.getDate() + daysNeeded);
      estimatedFinishDate = eta.toISOString();
    }

    return {
      metricType: goal.metricType,
      periodType: goal.periodType,
      targetValue: goal.targetValue,
      actualValue,
      remainingValue,
      percent,
      trendLast4Avg,
      estimatedFinishDate,
    };
  }

  return {
    weeklyChapter: buildSummary("weekly_chapter_goal"),
    monthlyChapter: buildSummary("monthly_chapter_goal"),
    monthlyCompleted: buildSummary("monthly_completed_goal"),
  };
}
