import type { SeriesStatus } from "@/lib/types";

export type Notice = {
  tone: "success" | "error" | "info";
  message: string;
  action?: {
    label: string;
    operationId: string;
  };
};

export type ImportPreviewItem = {
  index: number;
  title: string;
  status: SeriesStatus;
  totalChapters: number;
  chaptersRead: number;
};

export type BackupListItem = {
  id: string;
  fileName: string;
  reason: string;
  createdAt: string;
  sizeBytes: number;
};

export type BackupRestorePreview = {
  backupId: string;
  backupFileName: string;
  snapshotCreatedAt: string;
  totalInBackup: number;
  totalCurrent: number;
  toAdd: number;
  toUpdate: number;
  toDelete: number;
};

export type BackupRestoreResult = {
  backupId: string;
  restoredSeries: number;
  restoredSources: number;
  deletedSeries: number;
  preRestoreBackupFileName: string;
};

export type EnrichmentStats = {
  pending: number;
  running: number;
  failed: number;
  done: number;
};

export type OperationActionType =
  | "create_series"
  | "update_series"
  | "update_chapters_read"
  | "delete_series"
  | "undo_operation";

export type OperationHistoryItem = {
  id: string;
  actionType: OperationActionType;
  entityType: "series";
  entityId: string;
  titleSnapshot: string | null;
  createdAt: string;
  undoneAt: string | null;
};

export type UndoOperationResult = {
  operationId: string;
  undoOperationId: string;
  entityId: string;
  actionType: OperationActionType;
};

export type SavedViewMode = "dynamic" | "collection";

export type SavedView = {
  id: string;
  name: string;
  mode: SavedViewMode;
  query: Record<string, unknown> | null;
  sort: Record<string, unknown> | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  collectionSeriesIds: string[];
};

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