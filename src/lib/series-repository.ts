import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type {
  RereadSession,
  Series,
  SeriesFilters,
  SeriesStatus,
  SourceErrorInfo,
  SourceType,
} from "@/lib/types";

const sourceSchema = z.object({
  type: z.enum(["TR", "EN"]),
  url: z.string().url(),
  site: z.string().trim().min(1).nullable().optional(),
  canonicalId: z.string().trim().min(1).nullable().optional(),
  scrapedAt: z.string().datetime().nullable().optional(),
  scraperName: z.string().trim().min(1).nullable().optional(),
  lastError: z
    .object({
      message: z.string(),
      timestamp: z.string().datetime(),
    })
    .nullable()
    .optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

const rereadSessionSchema = z.object({
  startDate: z.string().nullable().optional(),
  finishDate: z.string().nullable().optional(),
});

const baseSeriesSchema = z.object({
  title: z.string().trim().min(1),
  totalChapters: z.number().int().min(0).default(0),
  chaptersRead: z.number().int().min(0).default(0),
  startDate: z.string().nullable().optional(),
  finishDate: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  description: z.string().default(""),
  personalNotes: z.string().default(""),
  status: z.enum(["plan_to_read", "reading", "completed", "dropped", "up_to_date"] as const),
  reread: z.boolean().default(false),
  totalRereads: z.number().int().min(0).default(0),
  rereadSessions: z.array(rereadSessionSchema).default([]),
  novelToRead: z.boolean().default(false),
  followUpdates: z.boolean().default(false),
  preferredSourceType: z.enum(["TR", "EN"]).nullable().default(null),
  coverImageBlob: z.instanceof(Uint8Array).nullable().optional(),
  coverImageMimeType: z.string().trim().min(1).nullable().optional(),
  coverImageFetchedAt: z.string().datetime().nullable().optional(),
  metadataFetchedAt: z.string().datetime().nullable().optional(),
  sources: z.array(sourceSchema).default([]),
});

export const createSeriesSchema = baseSeriesSchema;
export const updateSeriesSchema = baseSeriesSchema.partial();

type SeriesRow = {
  id: string;
  title: string;
  total_chapters: number;
  chapters_read: number;
  start_date: string | null;
  finish_date: string | null;
  rating: number | null;
  description: string;
  personal_notes: string;
  status: SeriesStatus;
  reread: number;
  total_rereads: number;
  reread_sessions: string;
  novel_to_read: number;
  follow_updates: number;
  preferred_source_type: SourceType | null;
  cover_image_blob: Uint8Array | null;
  cover_image_mime_type: string | null;
  cover_image_fetched_at: string | null;
  metadata_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

type SeriesSourceRow = {
  id: string;
  series_id: string;
  type: SourceType;
  url: string;
  site: string | null;
  canonical_id: string | null;
  scraped_at: string | null;
  scraper_name: string | null;
  last_error: string | null;
  meta: string | null;
};

function parseRereadSessions(raw: string): RereadSession[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return z
      .array(rereadSessionSchema)
      .parse(parsed)
      .map((session) => ({
        startDate: session.startDate ?? null,
        finishDate: session.finishDate ?? null,
      }));
  } catch {
    return [];
  }
}

function mapSeriesRow(row: SeriesRow): Omit<Series, "sources"> {
  return {
    id: row.id,
    title: row.title,
    totalChapters: row.total_chapters,
    chaptersRead: row.chapters_read,
    startDate: row.start_date,
    finishDate: row.finish_date,
    rating: row.rating,
    description: row.description ?? "",
    personalNotes: row.personal_notes,
    status: row.status,
    reread: Boolean(row.reread),
    totalRereads: row.total_rereads ?? 0,
    rereadSessions: parseRereadSessions(row.reread_sessions ?? "[]"),
    novelToRead: Boolean(row.novel_to_read),
    followUpdates: Boolean(row.follow_updates),
    preferredSourceType: row.preferred_source_type,
    hasCoverImage: Boolean(row.cover_image_blob && row.cover_image_blob.length > 0),
    coverImageMimeType: row.cover_image_mime_type,
    coverImageFetchedAt: row.cover_image_fetched_at,
    metadataFetchedAt: row.metadata_fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
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

function parseSourceError(raw: string | null): SourceErrorInfo | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = z
      .object({
        message: z.string(),
        timestamp: z.string().datetime(),
      })
      .parse(parsed);
    return result;
  } catch {
    return null;
  }
}

function getSources(seriesId: string): Series["sources"] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta FROM series_sources WHERE series_id = ?",
    )
    .all(seriesId) as SeriesSourceRow[];

  return rows.map((row) => ({
    id: row.id,
    seriesId: row.series_id,
    type: row.type,
    url: row.url,
    site: row.site,
    canonicalId: row.canonical_id,
    scrapedAt: row.scraped_at,
    scraperName: row.scraper_name,
    lastError: parseSourceError(row.last_error),
    meta: parseJsonObject(row.meta),
  }));
}

function attachSources(rows: SeriesRow[]): Series[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  const srcRows = db
    .prepare(
      `SELECT id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta FROM series_sources WHERE series_id IN (${placeholders})`,
    )
    .all(...ids) as SeriesSourceRow[];

  const byId = new Map<string, Series["sources"]>();
  for (const s of srcRows) {
    const arr = byId.get(s.series_id) ?? [];
    arr.push({
      id: s.id,
      seriesId: s.series_id,
      type: s.type,
      url: s.url,
      site: s.site,
      canonicalId: s.canonical_id,
      scrapedAt: s.scraped_at,
      scraperName: s.scraper_name,
      lastError: parseSourceError(s.last_error),
      meta: parseJsonObject(s.meta),
    });
    byId.set(s.series_id, arr);
  }

  return rows.map((row) => ({
    ...mapSeriesRow(row),
    sources: byId.get(row.id) ?? [],
  }));
}

export function getStatusCounts(filters: Omit<SeriesFilters, "status"> = {}): Record<SeriesStatus, number> {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.query?.trim()) {
    where.push("LOWER(title) LIKE ?");
    params.push(`%${filters.query.trim().toLowerCase()}%`);
  }
  if (typeof filters.reread === "boolean") {
    where.push("reread = ?");
    params.push(filters.reread ? 1 : 0);
  }
  if (typeof filters.novelToRead === "boolean") {
    where.push("novel_to_read = ?");
    params.push(filters.novelToRead ? 1 : 0);
  }
  if (typeof filters.followUpdates === "boolean") {
    where.push("follow_updates = ?");
    params.push(filters.followUpdates ? 1 : 0);
  }

  const sql = [
    "SELECT status, COUNT(*) as count FROM series",
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    "GROUP BY status",
  ]
    .filter(Boolean)
    .join(" ");

  const rows = db.prepare(sql).all(...params) as Array<{ status: SeriesStatus; count: number }>;
  const result: Record<SeriesStatus, number> = {
    plan_to_read: 0,
    reading: 0,
    completed: 0,
    dropped: 0,
    up_to_date: 0,
  };
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}

export function listSeries(filters: SeriesFilters = {}): Series[] {
  const db = getDb();

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.query?.trim()) {
    where.push("LOWER(title) LIKE ?");
    params.push(`%${filters.query.trim().toLowerCase()}%`);
  }

  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }

  if (typeof filters.reread === "boolean") {
    where.push("reread = ?");
    params.push(filters.reread ? 1 : 0);
  }

  if (typeof filters.novelToRead === "boolean") {
    where.push("novel_to_read = ?");
    params.push(filters.novelToRead ? 1 : 0);
  }

  if (typeof filters.followUpdates === "boolean") {
    where.push("follow_updates = ?");
    params.push(filters.followUpdates ? 1 : 0);
  }

  const sql = [
    "SELECT * FROM series",
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    "ORDER BY updated_at DESC",
  ]
    .filter(Boolean)
    .join(" ");

  const rows = db.prepare(sql).all(...params) as SeriesRow[];
  return attachSources(rows);
}

export function getSeriesById(id: string): Series | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM series WHERE id = ?").get(id) as SeriesRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapSeriesRow(row),
    sources: getSources(row.id),
  };
}

export function createSeries(payload: unknown): Series {
  const db = getDb();
  const input = createSeriesSchema.parse(payload);
  const id = randomUUID();
  const now = new Date().toISOString();

  const sourceEntries = input.sources.map((s) => ({
    id: randomUUID(),
    seriesId: id,
    type: s.type,
    url: s.url,
    site: s.site ?? null,
    canonicalId: s.canonicalId ?? null,
    scrapedAt: s.scrapedAt ?? null,
    scraperName: s.scraperName ?? null,
    lastError: s.lastError ?? null,
    meta: s.meta ?? null,
  }));

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO series (
        id, title, total_chapters, chapters_read, start_date, finish_date, rating,
        description, personal_notes, status, reread, total_rereads, reread_sessions,
        novel_to_read, follow_updates, preferred_source_type, created_at, updated_at
        , cover_image_blob, cover_image_mime_type, cover_image_fetched_at, metadata_fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      input.title,
      input.totalChapters,
      input.chaptersRead,
      input.startDate ?? null,
      input.finishDate ?? null,
      input.rating ?? null,
      input.description,
      input.personalNotes,
      input.status,
      input.reread ? 1 : 0,
      input.totalRereads,
      JSON.stringify(input.rereadSessions),
      input.novelToRead ? 1 : 0,
      input.followUpdates ? 1 : 0,
      input.preferredSourceType,
      now,
      now,
      input.coverImageBlob ?? null,
      input.coverImageMimeType ?? null,
      input.coverImageFetchedAt ?? null,
      input.metadataFetchedAt ?? null,
    );

    for (const src of sourceEntries) {
      db.prepare(
        `INSERT INTO series_sources
         (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        src.id,
        src.seriesId,
        src.type,
        src.url,
        src.site,
        src.canonicalId,
        src.scrapedAt,
        src.scraperName,
        src.lastError ? JSON.stringify(src.lastError) : null,
        src.meta ? JSON.stringify(src.meta) : null,
        now,
      );
    }
  });

  tx();

  return {
    id,
    title: input.title,
    totalChapters: input.totalChapters,
    chaptersRead: input.chaptersRead,
    startDate: input.startDate ?? null,
    finishDate: input.finishDate ?? null,
    rating: input.rating ?? null,
    description: input.description,
    personalNotes: input.personalNotes,
    status: input.status,
    reread: input.reread,
    totalRereads: input.totalRereads,
    rereadSessions: input.rereadSessions.map((s) => ({
      startDate: s.startDate ?? null,
      finishDate: s.finishDate ?? null,
    })),
    novelToRead: input.novelToRead,
    followUpdates: input.followUpdates,
    preferredSourceType: input.preferredSourceType,
    hasCoverImage: Boolean(input.coverImageBlob && input.coverImageBlob.length > 0),
    coverImageMimeType: input.coverImageMimeType ?? null,
    coverImageFetchedAt: input.coverImageFetchedAt ?? null,
    metadataFetchedAt: input.metadataFetchedAt ?? null,
    sources: sourceEntries,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSeries(id: string, payload: unknown): Series | null {
  const db = getDb();
  const input = updateSeriesSchema.parse(payload);
  const existing = getSeriesById(id);

  if (!existing) {
    return null;
  }

  const merged = {
    ...existing,
    ...input,
    sources: input.sources ?? existing.sources,
  };
  const now = new Date().toISOString();

  const sourceEntries = merged.sources.map((s) => ({
    id: randomUUID(),
    seriesId: id,
    type: s.type,
    url: s.url,
    site: s.site ?? null,
    canonicalId: s.canonicalId ?? null,
    scrapedAt: s.scrapedAt ?? null,
    scraperName: s.scraperName ?? null,
    lastError: s.lastError ?? null,
    meta: s.meta ?? null,
  }));

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE series SET
        title = ?,
        total_chapters = ?,
        chapters_read = ?,
        start_date = ?,
        finish_date = ?,
        rating = ?,
        description = ?,
        personal_notes = ?,
        status = ?,
        reread = ?,
        total_rereads = ?,
        reread_sessions = ?,
        novel_to_read = ?,
        follow_updates = ?,
        preferred_source_type = ?,
        cover_image_blob = COALESCE(?, cover_image_blob),
        cover_image_mime_type = ?,
        cover_image_fetched_at = ?,
        metadata_fetched_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    ).run(
      merged.title,
      merged.totalChapters,
      merged.chaptersRead,
      merged.startDate,
      merged.finishDate,
      merged.rating,
      merged.description,
      merged.personalNotes,
      merged.status,
      merged.reread ? 1 : 0,
      merged.totalRereads,
      JSON.stringify(merged.rereadSessions),
      merged.novelToRead ? 1 : 0,
      merged.followUpdates ? 1 : 0,
      merged.preferredSourceType,
      input.coverImageBlob ?? null,
      merged.coverImageMimeType,
      merged.coverImageFetchedAt,
      merged.metadataFetchedAt,
      now,
      id,
    );

    db.prepare("DELETE FROM series_sources WHERE series_id = ?").run(id);
    for (const src of sourceEntries) {
      db.prepare(
        `INSERT INTO series_sources
         (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        src.id,
        src.seriesId,
        src.type,
        src.url,
        src.site,
        src.canonicalId,
        src.scrapedAt,
        src.scraperName,
        src.lastError ? JSON.stringify(src.lastError) : null,
        src.meta ? JSON.stringify(src.meta) : null,
        now,
      );
    }
  });

  tx();

  return {
    ...merged,
    rereadSessions: merged.rereadSessions.map((s) => ({
      startDate: s.startDate ?? null,
      finishDate: s.finishDate ?? null,
    })),
    hasCoverImage: input.coverImageBlob ? input.coverImageBlob.length > 0 : merged.hasCoverImage,
    sources: sourceEntries,
    updatedAt: now,
  };
}

export function getSeriesCoverById(id: string): { blob: Uint8Array; mimeType: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT cover_image_blob, cover_image_mime_type FROM series WHERE id = ? LIMIT 1")
    .get(id) as { cover_image_blob: Uint8Array | null; cover_image_mime_type: string | null } | undefined;

  if (!row?.cover_image_blob || row.cover_image_blob.length === 0) {
    return null;
  }

  return {
    blob: row.cover_image_blob,
    mimeType: row.cover_image_mime_type || "image/jpeg",
  };
}

export function deleteSeries(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM series WHERE id = ?").run(id);
  return result.changes > 0;
}

export function findSeriesByTitle(title: string): Series | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM series WHERE LOWER(title) = LOWER(?) LIMIT 1")
    .get(title.trim()) as SeriesRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapSeriesRow(row),
    sources: getSources(row.id),
  };
}

export function findSeriesByCanonicalSource(site: string, canonicalId: string): Series | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.*
       FROM series s
       INNER JOIN series_sources ss ON ss.series_id = s.id
       WHERE ss.site = ? AND ss.canonical_id = ?
       ORDER BY s.updated_at DESC
       LIMIT 1`,
    )
    .get(site, canonicalId) as SeriesRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapSeriesRow(row),
    sources: getSources(row.id),
  };
}

function buildMergedPayload(parsed: z.infer<typeof createSeriesSchema>, existing: Series) {
  return {
    ...parsed,
    chaptersRead: existing.chaptersRead,
    rating: existing.rating,
    description: parsed.description?.trim() ? parsed.description : existing.description,
    personalNotes: existing.personalNotes,
    startDate: existing.startDate,
    finishDate: existing.finishDate,
    totalRereads: existing.totalRereads,
    rereadSessions: existing.rereadSessions,
    preferredSourceType: existing.preferredSourceType,
    sources: [...existing.sources, ...parsed.sources].filter((source, idx, arr) => {
      const key = `${source.site || ""}|${source.canonicalId || ""}|${source.type}|${source.url}`;
      return arr.findIndex((item) => `${item.site || ""}|${item.canonicalId || ""}|${item.type}|${item.url}` === key) === idx;
    }),
  };
}

export function mergeSeriesByTitle(payload: unknown): { type: "added" | "merged"; series: Series } {
  const parsed = createSeriesSchema.parse(payload);
  const existing = findSeriesByTitle(parsed.title);

  if (!existing) {
    return { type: "added", series: createSeries(parsed) };
  }

  const nextPayload = buildMergedPayload(parsed, existing);

  const updated = updateSeries(existing.id, nextPayload);
  return { type: "merged", series: updated as Series };
}

export function mergeSeriesByCanonicalOrTitle(payload: unknown): { type: "added" | "merged"; series: Series } {
  const parsed = createSeriesSchema.parse(payload);
  const canonicalSource = parsed.sources.find((source) => source.site && source.canonicalId);

  if (canonicalSource?.site && canonicalSource.canonicalId) {
    const existingByCanonical = findSeriesByCanonicalSource(canonicalSource.site, canonicalSource.canonicalId);
    if (existingByCanonical) {
      const nextPayload = buildMergedPayload(parsed, existingByCanonical);
      const updated = updateSeries(existingByCanonical.id, nextPayload);
      return { type: "merged", series: updated as Series };
    }
  }

  return mergeSeriesByTitle(parsed);
}

export function batchMergeSeriesByTitle(items: unknown[]): { added: number; merged: number } {
  if (items.length === 0) return { added: 0, merged: 0 };
  const db = getDb();
  let added = 0;
  let merged = 0;

  const run = db.transaction(() => {
    for (const item of items) {
      const result = mergeSeriesByTitle(item);
      if (result.type === "added") added++;
      else merged++;
    }
  });

  run();
  return { added, merged };
}

export function batchMergeSeriesByCanonicalOrTitle(items: unknown[]): { added: number; merged: number } {
  if (items.length === 0) return { added: 0, merged: 0 };
  const db = getDb();
  let added = 0;
  let merged = 0;

  const run = db.transaction(() => {
    for (const item of items) {
      const result = mergeSeriesByCanonicalOrTitle(item);
      if (result.type === "added") added++;
      else merged++;
    }
  });

  run();
  return { added, merged };
}
