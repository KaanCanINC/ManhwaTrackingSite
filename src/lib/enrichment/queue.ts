import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { ENRICH_MIN_CONFIDENCE, sleep } from "./config";
import type { Enrichment, ImportSource } from "./metadata";
import { fetchEnrichment, fetchEnrichmentByCanonicalId } from "./metadata";
import { tryDownloadCoverImage } from "@/lib/scrapers/cover-image";

type JobStatus = "pending" | "running" | "done" | "failed";

type EnrichmentJobRow = {
  id: string;
  series_id: string;
  source: ImportSource;
  status: JobStatus;
  attempts: number;
};

export type ImportEnrichmentStats = {
  pending: number;
  running: number;
  failed: number;
  done: number;
};

const MAX_RETRIES = Number(process.env.ENRICH_MAX_RETRIES || 3);
const LOOP_DELAY_MS = Number(process.env.ENRICH_LOOP_DELAY_MS || 500);

let workerActive = false;

function nowIso(): string {
  return new Date().toISOString();
}

function computeNextRetryIso(attempt: number): string {
  const waitMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return new Date(Date.now() + waitMs).toISOString();
}

export function enqueueImportEnrichmentJobs(source: ImportSource, seriesIds: string[]): number {
  if (seriesIds.length === 0) {
    return 0;
  }

  const uniqueIds = Array.from(new Set(seriesIds));
  const db = getDb();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const existingRows = db
    .prepare(
      `SELECT series_id FROM import_enrichment_jobs
       WHERE series_id IN (${placeholders}) AND source = ? AND status IN ('pending', 'running')`,
    )
    .all(...uniqueIds, source) as Array<{ series_id: string }>;

  const alreadyPending = new Set(existingRows.map((r) => r.series_id));
  const toEnqueue = uniqueIds.filter((id) => !alreadyPending.has(id));

  if (toEnqueue.length === 0) {
    startEnrichmentWorker();
    return 0;
  }

  const now = nowIso();
  const insertStmt = db.prepare(
    `INSERT INTO import_enrichment_jobs
     (id, series_id, source, status, attempts, next_retry_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`,
  );
  const insertMany = db.transaction((ids: string[]) => {
    for (const seriesId of ids) {
      insertStmt.run(randomUUID(), seriesId, source, now, now, now);
    }
  });
  insertMany(toEnqueue);

  startEnrichmentWorker();
  return toEnqueue.length;
}

export function getImportEnrichmentStats(): ImportEnrichmentStats {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM import_enrichment_jobs
       GROUP BY status`,
    )
    .all() as Array<{ status: JobStatus; count: number }>;

  const stats: ImportEnrichmentStats = {
    pending: 0,
    running: 0,
    failed: 0,
    done: 0,
  };

  for (const row of rows) {
    stats[row.status] = row.count;
  }

  return stats;
}

export function retryFailedImportEnrichmentJobs(limit = 100): { retried: number } {
  const db = getDb();
  const now = nowIso();

  const rows = db
    .prepare(
      `SELECT id
       FROM import_enrichment_jobs
       WHERE status = 'failed'
       ORDER BY updated_at ASC
       LIMIT ?`,
    )
    .all(limit) as Array<{ id: string }>;

  if (rows.length === 0) {
    return { retried: 0 };
  }

  const update = db.prepare(
    `UPDATE import_enrichment_jobs
     SET status = 'pending', next_retry_at = ?, last_error = NULL, updated_at = ?
     WHERE id = ?`,
  );

  const tx = db.transaction(() => {
    for (const row of rows) {
      update.run(now, now, row.id);
    }
  });

  tx();
  startEnrichmentWorker();

  return { retried: rows.length };
}

function pickNextJob(): EnrichmentJobRow | null {
  const db = getDb();
  const now = nowIso();

  const row = db
    .prepare(
      `SELECT id, series_id, source, status, attempts
       FROM import_enrichment_jobs
       WHERE status = 'pending' OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(now) as EnrichmentJobRow | undefined;

  if (!row) return null;

  db.prepare(
    `UPDATE import_enrichment_jobs
     SET status = 'running', attempts = attempts + 1, updated_at = ?
     WHERE id = ?`,
  ).run(now, row.id);

  return {
    ...row,
    attempts: row.attempts + 1,
  };
}

function markDone(jobId: string, warning: string | null = null): void {
  const db = getDb();
  db.prepare(
    `UPDATE import_enrichment_jobs
     SET status = 'done', next_retry_at = NULL, last_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(warning, nowIso(), jobId);
}

function markFailed(jobId: string, attempts: number, message: string): void {
  const db = getDb();

  if (attempts >= MAX_RETRIES) {
    db.prepare(
      `UPDATE import_enrichment_jobs
       SET status = 'failed', next_retry_at = NULL, last_error = ?, updated_at = ?
       WHERE id = ?`,
    ).run(message, nowIso(), jobId);
    return;
  }

  db.prepare(
    `UPDATE import_enrichment_jobs
     SET status = 'failed', next_retry_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(computeNextRetryIso(attempts), message, nowIso(), jobId);
}

function getSeriesMetadata(seriesId: string): {
  title: string;
  description: string;
  totalChapters: number;
  hasCover: boolean;
  metadataSourceSite: "myanimelist" | "anilist" | null;
  metadataSourceCanonicalId: string | null;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT title, description, total_chapters, cover_image_blob, metadata_source_site, metadata_source_canonical_id
       FROM series WHERE id = ? LIMIT 1`,
    )
    .get(seriesId) as
    | {
        title: string;
        description: string;
        total_chapters: number;
        cover_image_blob: Uint8Array | null;
        metadata_source_site: "myanimelist" | "anilist" | null;
        metadata_source_canonical_id: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    title: row.title,
    description: row.description || "",
    totalChapters: row.total_chapters || 0,
    hasCover: Boolean(row.cover_image_blob && row.cover_image_blob.length > 0),
    metadataSourceSite: row.metadata_source_site,
    metadataSourceCanonicalId: row.metadata_source_canonical_id,
  };
}

async function applyEnrichment(seriesId: string, source: ImportSource, enrichment: Enrichment): Promise<void> {
  const current = getSeriesMetadata(seriesId);
  if (!current) {
    return;
  }

  const cover = current.hasCover
    ? null
    : await tryDownloadCoverImage(enrichment.coverImageUrl, enrichment.sourceUrl);

  const nextDescription = current.description.trim()
    ? current.description
    : (enrichment.description || current.description);

  const nextTotal =
    current.totalChapters > 0
      ? current.totalChapters
      : (enrichment.totalChapters ?? current.totalChapters);

  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE series SET
      description = ?,
      total_chapters = ?,
      preferred_source_type = COALESCE(preferred_source_type, ?),
      metadata_source_url = ?,
      metadata_source_site = ?,
      metadata_source_canonical_id = ?,
      metadata_source_updated_at = ?,
      metadata_fetched_at = ?,
      cover_image_blob = COALESCE(?, cover_image_blob),
      cover_image_mime_type = COALESCE(?, cover_image_mime_type),
      cover_image_fetched_at = COALESCE(?, cover_image_fetched_at),
      updated_at = ?
     WHERE id = ?`,
  ).run(
    nextDescription,
    nextTotal,
    source === "mal" ? "MAL" : "ANILIST",
    enrichment.sourceUrl,
    enrichment.sourceSite,
    enrichment.canonicalId,
    now,
    now,
    cover?.blob ?? null,
    cover?.mimeType ?? null,
    cover?.fetchedAt ?? null,
    now,
    seriesId,
  );
}

async function processOne(job: EnrichmentJobRow): Promise<void> {
  const series = getSeriesMetadata(job.series_id);
  if (!series) {
    markDone(job.id);
    return;
  }

  let effectiveSource = job.source;
  let enriched: Enrichment | null = null;

  const hasCanonicalForJobSource =
    (job.source === "mal" && series.metadataSourceSite === "myanimelist") ||
    (job.source === "anilist" && series.metadataSourceSite === "anilist");

  if (hasCanonicalForJobSource && series.metadataSourceCanonicalId) {
    enriched = await fetchEnrichmentByCanonicalId(job.source, series.metadataSourceCanonicalId);
  }

  if (!enriched) {
    enriched = await fetchEnrichment(job.source, series.title, series.totalChapters || null);
  }

  // If MAL enrichment is unavailable (including cooldown/ban scenarios), fall back to AniList.
  if (!enriched && job.source === "mal") {
    enriched = await fetchEnrichment("anilist", series.title);
    if (enriched) {
      effectiveSource = "anilist";
    }
  }

  if (!enriched) {
    markFailed(job.id, job.attempts, "No enrichment data found");
    return;
  }

  if (enriched.confidence < ENRICH_MIN_CONFIDENCE) {
    markFailed(job.id, job.attempts, `low_confidence:${enriched.confidence.toFixed(2)}:${enriched.matchReason}`);
    return;
  }

  if (enriched.contentCategory === "hentai") {
    markFailed(job.id, job.attempts, "adult_hentai_blocked");
    return;
  }

  await applyEnrichment(job.series_id, effectiveSource, enriched);
  markDone(job.id, enriched.contentCategory === "ecchi" ? "ecchi_warning" : null);
}

async function workerLoop(): Promise<void> {
  while (true) {
    const job = pickNextJob();
    if (!job) {
      workerActive = false;
      return;
    }

    try {
      await processOne(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected enrichment failure";
      markFailed(job.id, job.attempts, message);
    }

    await sleep(LOOP_DELAY_MS);
  }
}

export function startEnrichmentWorker(): void {
  if (workerActive) {
    return;
  }

  workerActive = true;
  void workerLoop();
}
