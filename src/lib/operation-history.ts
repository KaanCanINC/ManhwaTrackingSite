import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type OperationActionType =
  | "create_series"
  | "update_series"
  | "update_chapters_read"
  | "delete_series"
  | "undo_operation";

export type OperationEntityType = "series";

export type OperationSourceSnapshot = {
  id: string;
  type: "TR" | "EN";
  url: string;
  site: string | null;
  canonicalId: string | null;
  scrapedAt: string | null;
  scraperName: string | null;
  lastError: { message: string; timestamp: string } | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type OperationSeriesSnapshot = {
  id: string;
  title: string;
  totalChapters: number;
  chaptersRead: number;
  startDate: string | null;
  finishDate: string | null;
  rating: number | null;
  description: string;
  personalNotes: string;
  status: "plan_to_read" | "reading" | "completed" | "dropped" | "up_to_date";
  contentType: "MANHWA" | "MANHUA" | "MANGA" | null;
  reread: boolean;
  totalRereads: number;
  rereadSessions: Array<{ startDate: string | null; finishDate: string | null }>;
  novelToRead: boolean;
  followUpdates: boolean;
  preferredSourceType: "TR" | "EN" | "MAL" | "ANILIST" | "CUSTOM" | null;
  coverImageBlobBase64: string | null;
  coverImageMimeType: string | null;
  coverImageFetchedAt: string | null;
  metadataFetchedAt: string | null;
  metadataSourceUrl: string | null;
  metadataSourceSite: "myanimelist" | "anilist" | null;
  metadataSourceCanonicalId: string | null;
  metadataSourceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationEntitySnapshot = {
  series: OperationSeriesSnapshot;
  sources: OperationSourceSnapshot[];
};

export type HistoryUndoPayload = {
  expectedUpdatedAt?: string;
  targetOperationId?: string;
};

export type OperationHistoryInsert = {
  actionType: OperationActionType;
  entityType: OperationEntityType;
  entityId: string;
  before: OperationEntitySnapshot | null;
  after: OperationEntitySnapshot | null;
  undoPayload?: HistoryUndoPayload;
};

export type OperationHistoryListItem = {
  id: string;
  actionType: OperationActionType;
  entityType: OperationEntityType;
  entityId: string;
  titleSnapshot: string | null;
  createdAt: string;
  undoneAt: string | null;
};

type OperationHistoryRow = {
  id: string;
  action_type: OperationActionType;
  entity_type: OperationEntityType;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  undo_payload_json: string | null;
  created_at: string;
  undone_at: string | null;
};

function toJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function restoreSeriesSnapshot(snapshot: OperationEntitySnapshot): void {
  const db = getDb();

  db.prepare(
    `INSERT INTO series (
      id, title, total_chapters, chapters_read, start_date, finish_date, rating,
      description, personal_notes, status, content_type, reread, total_rereads, reread_sessions,
      novel_to_read, follow_updates, preferred_source_type,
      metadata_source_url, metadata_source_site, metadata_source_canonical_id, metadata_source_updated_at,
      cover_image_blob, cover_image_mime_type, cover_image_fetched_at, metadata_fetched_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snapshot.series.id,
    snapshot.series.title,
    snapshot.series.totalChapters,
    snapshot.series.chaptersRead,
    snapshot.series.startDate,
    snapshot.series.finishDate,
    snapshot.series.rating,
    snapshot.series.description,
    snapshot.series.personalNotes,
    snapshot.series.status,
    snapshot.series.contentType,
    snapshot.series.reread ? 1 : 0,
    snapshot.series.totalRereads,
    JSON.stringify(snapshot.series.rereadSessions),
    snapshot.series.novelToRead ? 1 : 0,
    snapshot.series.followUpdates ? 1 : 0,
    snapshot.series.preferredSourceType,
    snapshot.series.metadataSourceUrl,
    snapshot.series.metadataSourceSite,
    snapshot.series.metadataSourceCanonicalId,
    snapshot.series.metadataSourceUpdatedAt,
    snapshot.series.coverImageBlobBase64
      ? Buffer.from(snapshot.series.coverImageBlobBase64, "base64")
      : null,
    snapshot.series.coverImageMimeType,
    snapshot.series.coverImageFetchedAt,
    snapshot.series.metadataFetchedAt,
    snapshot.series.createdAt,
    snapshot.series.updatedAt,
  );

  const insertSource = db.prepare(
    `INSERT INTO series_sources
       (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const source of snapshot.sources) {
    insertSource.run(
      source.id,
      snapshot.series.id,
      source.type,
      source.url,
      source.site,
      source.canonicalId,
      source.scrapedAt,
      source.scraperName,
      source.lastError ? JSON.stringify(source.lastError) : null,
      source.meta ? JSON.stringify(source.meta) : null,
      source.createdAt,
    );
  }
}

function replaceWithSnapshot(snapshot: OperationEntitySnapshot): void {
  const db = getDb();

  db.prepare(
    `UPDATE series SET
      title = ?,
      total_chapters = ?,
      chapters_read = ?,
      start_date = ?,
      finish_date = ?,
      rating = ?,
      description = ?,
      personal_notes = ?,
      status = ?,
      content_type = ?,
      reread = ?,
      total_rereads = ?,
      reread_sessions = ?,
      novel_to_read = ?,
      follow_updates = ?,
      preferred_source_type = ?,
      metadata_source_url = ?,
      metadata_source_site = ?,
      metadata_source_canonical_id = ?,
      metadata_source_updated_at = ?,
      cover_image_blob = ?,
      cover_image_mime_type = ?,
      cover_image_fetched_at = ?,
      metadata_fetched_at = ?,
      created_at = ?,
      updated_at = ?
    WHERE id = ?`,
  ).run(
    snapshot.series.title,
    snapshot.series.totalChapters,
    snapshot.series.chaptersRead,
    snapshot.series.startDate,
    snapshot.series.finishDate,
    snapshot.series.rating,
    snapshot.series.description,
    snapshot.series.personalNotes,
    snapshot.series.status,
    snapshot.series.contentType,
    snapshot.series.reread ? 1 : 0,
    snapshot.series.totalRereads,
    JSON.stringify(snapshot.series.rereadSessions),
    snapshot.series.novelToRead ? 1 : 0,
    snapshot.series.followUpdates ? 1 : 0,
    snapshot.series.preferredSourceType,
    snapshot.series.metadataSourceUrl,
    snapshot.series.metadataSourceSite,
    snapshot.series.metadataSourceCanonicalId,
    snapshot.series.metadataSourceUpdatedAt,
    snapshot.series.coverImageBlobBase64
      ? Buffer.from(snapshot.series.coverImageBlobBase64, "base64")
      : null,
    snapshot.series.coverImageMimeType,
    snapshot.series.coverImageFetchedAt,
    snapshot.series.metadataFetchedAt,
    snapshot.series.createdAt,
    snapshot.series.updatedAt,
    snapshot.series.id,
  );

  db.prepare("DELETE FROM series_sources WHERE series_id = ?").run(snapshot.series.id);
  const insertSource = db.prepare(
    `INSERT INTO series_sources
       (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const source of snapshot.sources) {
    insertSource.run(
      source.id,
      snapshot.series.id,
      source.type,
      source.url,
      source.site,
      source.canonicalId,
      source.scrapedAt,
      source.scraperName,
      source.lastError ? JSON.stringify(source.lastError) : null,
      source.meta ? JSON.stringify(source.meta) : null,
      source.createdAt,
    );
  }
}

function getSeriesUpdatedAt(id: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT updated_at FROM series WHERE id = ? LIMIT 1").get(id) as
    | { updated_at: string }
    | undefined;
  return row?.updated_at ?? null;
}

export function insertOperationHistory(entry: OperationHistoryInsert): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO operation_history
      (id, action_type, entity_type, entity_id, before_json, after_json, undo_payload_json, created_at, undone_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    entry.actionType,
    entry.entityType,
    entry.entityId,
    toJson(entry.before),
    toJson(entry.after),
    toJson(entry.undoPayload ?? null),
    now,
  );

  return id;
}

export function listOperationHistory(limit = 50, maxAgeDays = 7): OperationHistoryListItem[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeDays = Math.max(1, Math.min(maxAgeDays, 365));
  const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .prepare(
      `SELECT id, action_type, entity_type, entity_id, before_json, after_json, undo_payload_json, created_at, undone_at
       FROM operation_history
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(cutoff, safeLimit) as OperationHistoryRow[];

  return rows.map((row) => {
    const before = parseJson<OperationEntitySnapshot>(row.before_json);
    const after = parseJson<OperationEntitySnapshot>(row.after_json);

    return {
      id: row.id,
      actionType: row.action_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      titleSnapshot: after?.series.title ?? before?.series.title ?? null,
      createdAt: row.created_at,
      undoneAt: row.undone_at,
    };
  });
}

export function undoOperationById(operationId: string): {
  operationId: string;
  undoOperationId: string;
  entityId: string;
  actionType: OperationActionType;
} {
  const db = getDb();

  const run = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id, action_type, entity_type, entity_id, before_json, after_json, undo_payload_json, created_at, undone_at
         FROM operation_history
         WHERE id = ?
         LIMIT 1`,
      )
      .get(operationId) as OperationHistoryRow | undefined;

    if (!row) {
      throw new Error("Operation not found");
    }

    if (row.undone_at) {
      throw new Error("Operation already undone");
    }

    if (row.action_type === "undo_operation") {
      throw new Error("Undo operation cannot be undone");
    }

    const before = parseJson<OperationEntitySnapshot>(row.before_json);
    const after = parseJson<OperationEntitySnapshot>(row.after_json);
    const undoPayload = parseJson<HistoryUndoPayload>(row.undo_payload_json);

    if (row.entity_type !== "series") {
      throw new Error("Unsupported entity type");
    }

    if (row.action_type === "create_series") {
      if (!after) {
        throw new Error("Operation data is invalid");
      }
      const currentUpdatedAt = getSeriesUpdatedAt(row.entity_id);
      if (!currentUpdatedAt) {
        throw new Error("Series changed after operation; undo rejected");
      }
      if (undoPayload?.expectedUpdatedAt && currentUpdatedAt !== undoPayload.expectedUpdatedAt) {
        throw new Error("Series changed after operation; undo rejected");
      }
      db.prepare("DELETE FROM series WHERE id = ?").run(row.entity_id);
    } else if (row.action_type === "delete_series") {
      if (!before) {
        throw new Error("Operation data is invalid");
      }
      const currentUpdatedAt = getSeriesUpdatedAt(row.entity_id);
      if (currentUpdatedAt) {
        throw new Error("Series changed after operation; undo rejected");
      }
      restoreSeriesSnapshot(before);
    } else if (row.action_type === "update_series" || row.action_type === "update_chapters_read") {
      if (!before) {
        throw new Error("Operation data is invalid");
      }
      const currentUpdatedAt = getSeriesUpdatedAt(row.entity_id);
      if (!currentUpdatedAt) {
        throw new Error("Series changed after operation; undo rejected");
      }
      if (undoPayload?.expectedUpdatedAt && currentUpdatedAt !== undoPayload.expectedUpdatedAt) {
        throw new Error("Series changed after operation; undo rejected");
      }
      replaceWithSnapshot(before);
    } else {
      throw new Error("Unsupported operation type");
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE operation_history SET undone_at = ? WHERE id = ?").run(now, operationId);

    const undoOperationId = randomUUID();
    db.prepare(
      `INSERT INTO operation_history
        (id, action_type, entity_type, entity_id, before_json, after_json, undo_payload_json, created_at, undone_at)
       VALUES (?, 'undo_operation', ?, ?, NULL, NULL, ?, ?, NULL)`,
    ).run(
      undoOperationId,
      row.entity_type,
      row.entity_id,
      JSON.stringify({ targetOperationId: operationId }),
      now,
    );

    return {
      operationId,
      undoOperationId,
      entityId: row.entity_id,
      actionType: row.action_type,
    };
  });

  return run();
}
