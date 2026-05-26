import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";

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

const createViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mode: z.enum(["dynamic", "collection"]),
  query: z.record(z.string(), z.unknown()).nullable().optional(),
  sort: z.record(z.string(), z.unknown()).nullable().optional(),
  pinned: z.boolean().optional().default(false),
  seriesIds: z.array(z.string().trim().min(1)).optional().default([]),
});

const updateViewSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  query: z.record(z.string(), z.unknown()).nullable().optional(),
  sort: z.record(z.string(), z.unknown()).nullable().optional(),
  pinned: z.boolean().optional(),
});

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type SavedViewRow = {
  id: string;
  name: string;
  mode: SavedViewMode;
  query_json: string | null;
  sort_json: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
};

function collectionNameExists(name: string, excludeId?: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id
       FROM saved_views
       WHERE mode = 'collection'
         AND LOWER(TRIM(name)) = LOWER(TRIM(?))
         ${excludeId ? "AND id <> ?" : ""}
       LIMIT 1`,
    )
    .get(...(excludeId ? [name, excludeId] : [name])) as { id: string } | undefined;

  return Boolean(row);
}

export function listSavedViews(): SavedView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, mode, query_json, sort_json, pinned, created_at, updated_at
       FROM saved_views
       ORDER BY pinned DESC, updated_at DESC`,
    )
    .all() as SavedViewRow[];

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }

  const placeholders = ids.map(() => "?").join(", ");
  const collectionRows = db
    .prepare(
      `SELECT collection_id, series_id
       FROM collection_items
       WHERE collection_id IN (${placeholders})
       ORDER BY order_index ASC`,
    )
    .all(...ids) as Array<{ collection_id: string; series_id: string }>;

  const byCollection = new Map<string, string[]>();
  for (const row of collectionRows) {
    const list = byCollection.get(row.collection_id) ?? [];
    list.push(row.series_id);
    byCollection.set(row.collection_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mode: row.mode,
    query: parseJsonObject(row.query_json),
    sort: parseJsonObject(row.sort_json),
    pinned: Boolean(row.pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    collectionSeriesIds: byCollection.get(row.id) ?? [],
  }));
}

export function createSavedView(payload: unknown): SavedView {
  const input = createViewSchema.parse(payload);
  if (input.mode === "collection" && collectionNameExists(input.name)) {
    throw new Error("Collection name already exists");
  }

  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO saved_views
       (id, name, mode, query_json, sort_json, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.mode,
      input.query ? JSON.stringify(input.query) : null,
      input.sort ? JSON.stringify(input.sort) : null,
      input.pinned ? 1 : 0,
      now,
      now,
    );

    if (input.mode === "collection" && input.seriesIds.length > 0) {
      const insertItem = db.prepare(
        `INSERT INTO collection_items (collection_id, series_id, order_index, added_at)
         VALUES (?, ?, ?, ?)`,
      );
      const uniqueSeriesIds = Array.from(new Set(input.seriesIds));
      uniqueSeriesIds.forEach((seriesId, index) => {
        insertItem.run(id, seriesId, index, now);
      });
    }
  });

  run();

  return {
    id,
    name: input.name,
    mode: input.mode,
    query: input.query ?? null,
    sort: input.sort ?? null,
    pinned: input.pinned,
    createdAt: now,
    updatedAt: now,
    collectionSeriesIds: input.mode === "collection" ? Array.from(new Set(input.seriesIds)) : [],
  };
}

export function updateSavedView(id: string, payload: unknown): SavedView | null {
  const input = updateViewSchema.parse(payload);
  const db = getDb();

  const row = db
    .prepare(
      `SELECT id, name, mode, query_json, sort_json, pinned, created_at, updated_at
       FROM saved_views
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as SavedViewRow | undefined;

  if (!row) {
    return null;
  }

  if (row.mode === "collection" && input.name && collectionNameExists(input.name, id)) {
    throw new Error("Collection name already exists");
  }

  const next = {
    name: input.name ?? row.name,
    queryJson:
      input.query !== undefined
        ? input.query
          ? JSON.stringify(input.query)
          : null
        : row.query_json,
    sortJson:
      input.sort !== undefined
        ? input.sort
          ? JSON.stringify(input.sort)
          : null
        : row.sort_json,
    pinned: input.pinned ?? Boolean(row.pinned),
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `UPDATE saved_views
     SET name = ?, query_json = ?, sort_json = ?, pinned = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.name, next.queryJson, next.sortJson, next.pinned ? 1 : 0, next.updatedAt, id);

  const collectionSeriesIds = db
    .prepare(
      `SELECT series_id
       FROM collection_items
       WHERE collection_id = ?
       ORDER BY order_index ASC`,
    )
    .all(id) as Array<{ series_id: string }>;

  return {
    id: row.id,
    name: next.name,
    mode: row.mode,
    query: parseJsonObject(next.queryJson),
    sort: parseJsonObject(next.sortJson),
    pinned: next.pinned,
    createdAt: row.created_at,
    updatedAt: next.updatedAt,
    collectionSeriesIds: collectionSeriesIds.map((entry) => entry.series_id),
  };
}

export function deleteSavedView(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM saved_views WHERE id = ?").run(id);
  return result.changes > 0;
}

export function addCollectionItem(viewId: string, seriesId: string): { ok: true } {
  const db = getDb();
  const now = new Date().toISOString();

  const row = db
    .prepare("SELECT mode FROM saved_views WHERE id = ? LIMIT 1")
    .get(viewId) as { mode: SavedViewMode } | undefined;
  if (!row) {
    throw new Error("Saved view not found");
  }
  if (row.mode !== "collection") {
    throw new Error("Saved view is not a collection");
  }

  const exists = db
    .prepare("SELECT id FROM series WHERE id = ? LIMIT 1")
    .get(seriesId) as { id: string } | undefined;
  if (!exists) {
    throw new Error("Series not found");
  }

  const currentMax = db
    .prepare("SELECT COALESCE(MAX(order_index), -1) AS max_index FROM collection_items WHERE collection_id = ?")
    .get(viewId) as { max_index: number };

  db.prepare(
    `INSERT INTO collection_items (collection_id, series_id, order_index, added_at)
     VALUES (?, ?, ?, ?)`,
  ).run(viewId, seriesId, currentMax.max_index + 1, now);

  db.prepare("UPDATE saved_views SET updated_at = ? WHERE id = ?").run(now, viewId);
  return { ok: true };
}

export function addCollectionItems(viewId: string, seriesIds: string[]): {
  inserted: number;
  skipped: number;
} {
  const uniqueSeriesIds = Array.from(new Set(seriesIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueSeriesIds.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const db = getDb();
  const now = new Date().toISOString();

  const row = db
    .prepare("SELECT mode FROM saved_views WHERE id = ? LIMIT 1")
    .get(viewId) as { mode: SavedViewMode } | undefined;
  if (!row) {
    throw new Error("Saved view not found");
  }
  if (row.mode !== "collection") {
    throw new Error("Saved view is not a collection");
  }

  const placeholders = uniqueSeriesIds.map(() => "?").join(", ");
  const existingSeriesCount = db
    .prepare(`SELECT COUNT(*) as count FROM series WHERE id IN (${placeholders})`)
    .get(...uniqueSeriesIds) as { count: number };

  if (existingSeriesCount.count !== uniqueSeriesIds.length) {
    throw new Error("One or more series were not found");
  }

  const run = db.transaction(() => {
    let inserted = 0;
    let skipped = 0;

    let nextOrderIndex = (
      db
        .prepare(
          "SELECT COALESCE(MAX(order_index), -1) AS max_index FROM collection_items WHERE collection_id = ?",
        )
        .get(viewId) as { max_index: number }
    ).max_index + 1;

    const insert = db.prepare(
      `INSERT OR IGNORE INTO collection_items (collection_id, series_id, order_index, added_at)
       VALUES (?, ?, ?, ?)`,
    );

    for (const seriesId of uniqueSeriesIds) {
      const result = insert.run(viewId, seriesId, nextOrderIndex, now);
      if (result.changes > 0) {
        inserted += 1;
        nextOrderIndex += 1;
      } else {
        skipped += 1;
      }
    }

    if (inserted > 0) {
      db.prepare("UPDATE saved_views SET updated_at = ? WHERE id = ?").run(now, viewId);
    }

    return { inserted, skipped };
  });

  return run();
}

export function removeCollectionItem(viewId: string, seriesId: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM collection_items WHERE collection_id = ? AND series_id = ?")
    .run(viewId, seriesId);

  if (result.changes > 0) {
    db.prepare("UPDATE saved_views SET updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      viewId,
    );
    return true;
  }

  return false;
}

const reorderSchema = z.object({
  order: z.array(
    z.object({
      seriesId: z.string().trim().min(1),
      orderIndex: z.number().int().min(0),
    }),
  ),
});

export function reorderCollectionItems(viewId: string, payload: unknown): { updated: number } {
  const input = reorderSchema.parse(payload);
  const db = getDb();
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    const update = db.prepare(
      `UPDATE collection_items
       SET order_index = ?
       WHERE collection_id = ? AND series_id = ?`,
    );

    let updated = 0;
    for (const item of input.order) {
      const result = update.run(item.orderIndex, viewId, item.seriesId);
      updated += result.changes;
    }

    db.prepare("UPDATE saved_views SET updated_at = ? WHERE id = ?").run(now, viewId);
    return updated;
  });

  return { updated: run() };
}
