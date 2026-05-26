import { constants as fsConstants } from "node:fs";
import {
  access,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dataPaths } from "@/lib/db/storage";
import { getDb } from "@/lib/db";
import { listSeries } from "@/lib/series-repository";
import type {
  BackupListItem,
  BackupRestorePreview,
  BackupRestoreResult,
} from "@/lib/contracts";

function maxBackups(): number {
  const parsed = Number(process.env.MAX_BACKUPS || "60");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }
  return parsed;
}

export async function createBackup(reason: string): Promise<{ fileName: string; path: string }> {
  const db = getDb();
  const snapshot = {
    createdAt: new Date().toISOString(),
    reason,
    series: listSeries({}),
  };

  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  const filePath = path.join(dataPaths.backupsDir, fileName);

  await writeFile(filePath, JSON.stringify(snapshot), "utf8");

  db.prepare("INSERT INTO backups (id, file_name, reason, created_at) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    fileName,
    reason,
    snapshot.createdAt,
  );

  await rotateBackups();
  return { fileName, path: filePath };
}

async function rotateBackups(): Promise<void> {
  const files = (await readdir(dataPaths.backupsDir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const limit = maxBackups();
  for (const file of files.slice(limit)) {
    await unlink(path.join(dataPaths.backupsDir, file));
  }
}

let dailyBackupCheckedDate = "";

export async function runDailyBackupIfNeeded(): Promise<{ created: boolean; fileName?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyBackupCheckedDate === today) {
    return { created: false };
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM backups WHERE reason = 'daily' AND substr(created_at, 1, 10) = ? LIMIT 1`,
    )
    .get(today) as { id: string } | undefined;

  if (existing) {
    dailyBackupCheckedDate = today;
    return { created: false };
  }

  const backup = await createBackup("daily");
  dailyBackupCheckedDate = today;
  return { created: true, fileName: backup.fileName };
}

let lastChangeBackupAt = 0;
const CHANGE_BACKUP_COOLDOWN_MS = 15 * 60 * 1000;

export async function createChangeBackupIfCooledDown(): Promise<void> {
  await runDailyBackupIfNeeded();
  const now = Date.now();
  if (now - lastChangeBackupAt < CHANGE_BACKUP_COOLDOWN_MS) {
    return;
  }
  lastChangeBackupAt = now;
  await createBackup("change");
}

export async function listBackups(): Promise<BackupListItem[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, file_name, reason, created_at FROM backups ORDER BY created_at DESC")
    .all() as Array<{ id: string; file_name: string; reason: string; created_at: string }>;

  return Promise.all(rows.map(async (row) => {
    const fullPath = path.join(dataPaths.backupsDir, row.file_name);
    let sizeBytes = 0;
    try {
      sizeBytes = (await stat(fullPath)).size;
    } catch {
      sizeBytes = 0;
    }

    return {
      id: row.id,
      fileName: row.file_name,
      reason: row.reason,
      createdAt: row.created_at,
      sizeBytes,
    };
  }));
}

export async function getBackupFileById(
  id: string,
): Promise<{ fileName: string; fullPath: string } | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT file_name FROM backups WHERE id = ? LIMIT 1")
    .get(id) as { file_name: string } | undefined;

  if (!row?.file_name) {
    return null;
  }

  const fullPath = path.join(dataPaths.backupsDir, row.file_name);
  try {
    await access(fullPath, fsConstants.F_OK);
  } catch {
    return null;
  }

  return {
    fileName: row.file_name,
    fullPath,
  };
}

export async function deleteBackupById(id: string): Promise<boolean> {
  const db = getDb();
  const row = db
    .prepare("SELECT file_name FROM backups WHERE id = ? LIMIT 1")
    .get(id) as { file_name: string } | undefined;

  if (!row?.file_name) {
    return false;
  }

  const fullPath = path.join(dataPaths.backupsDir, row.file_name);
  try {
    await unlink(fullPath);
  } catch {
    // Keep behavior tolerant when file is already gone.
  }

  const result = db.prepare("DELETE FROM backups WHERE id = ?").run(id);
  return result.changes > 0;
}

const sourceSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["TR", "EN"]),
  url: z.string().url(),
  site: z.string().nullable().optional(),
  canonicalId: z.string().nullable().optional(),
  scrapedAt: z.string().nullable().optional(),
  scraperName: z.string().nullable().optional(),
  lastError: z
    .object({
      message: z.string(),
      timestamp: z.string(),
    })
    .nullable()
    .optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

const backupSeriesSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  totalChapters: z.number().int().min(0).default(0),
  chaptersRead: z.number().int().min(0).default(0),
  startDate: z.string().nullable().optional(),
  finishDate: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  description: z.string().default(""),
  personalNotes: z.string().default(""),
  status: z.enum(["plan_to_read", "reading", "completed", "dropped", "up_to_date"]),
  contentType: z.enum(["MANHWA", "MANHUA", "MANGA"]).nullable().default(null),
  reread: z.boolean().default(false),
  totalRereads: z.number().int().min(0).default(0),
  rereadSessions: z
    .array(
      z.object({
        startDate: z.string().nullable().optional(),
        finishDate: z.string().nullable().optional(),
      }),
    )
    .default([]),
  novelToRead: z.boolean().default(false),
  followUpdates: z.boolean().default(false),
  preferredSourceType: z.enum(["TR", "EN", "MAL", "ANILIST", "CUSTOM"]).nullable().default(null),
  metadataFetchedAt: z.string().nullable().optional(),
  metadataSourceUrl: z.string().url().nullable().optional(),
  metadataSourceSite: z.enum(["myanimelist", "anilist"]).nullable().optional(),
  metadataSourceCanonicalId: z.string().nullable().optional(),
  metadataSourceUpdatedAt: z.string().nullable().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
  sources: z.array(sourceSchema).default([]),
});

const backupSnapshotSchema = z.object({
  createdAt: z.string(),
  reason: z.string(),
  series: z.array(backupSeriesSchema),
});

type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;

async function loadBackupSnapshotById(
  backupId: string,
): Promise<{ fileName: string; snapshot: BackupSnapshot }> {
  const backup = await getBackupFileById(backupId);
  if (!backup) {
    throw new Error("Backup not found");
  }

  const raw = await readFile(backup.fullPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }

  const validated = backupSnapshotSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Backup file format is invalid");
  }

  return {
    fileName: backup.fileName,
    snapshot: validated.data,
  };
}

export async function previewRestoreByBackupId(backupId: string): Promise<BackupRestorePreview> {
  const loaded = await loadBackupSnapshotById(backupId);
  const db = getDb();

  const currentRows = db.prepare("SELECT id FROM series").all() as Array<{ id: string }>;
  const currentIds = new Set(currentRows.map((row) => row.id));
  const backupIds = new Set(loaded.snapshot.series.map((series) => series.id));

  let toAdd = 0;
  let toUpdate = 0;
  for (const id of backupIds) {
    if (currentIds.has(id)) {
      toUpdate += 1;
    } else {
      toAdd += 1;
    }
  }

  let toDelete = 0;
  for (const id of currentIds) {
    if (!backupIds.has(id)) {
      toDelete += 1;
    }
  }

  return {
    backupId,
    backupFileName: loaded.fileName,
    snapshotCreatedAt: loaded.snapshot.createdAt,
    totalInBackup: loaded.snapshot.series.length,
    totalCurrent: currentRows.length,
    toAdd,
    toUpdate,
    toDelete,
  };
}

export async function restoreByBackupId(backupId: string): Promise<BackupRestoreResult> {
  const loaded = await loadBackupSnapshotById(backupId);
  const preRestore = await createBackup(`pre-restore:${loaded.fileName}`);
  const db = getDb();

  const currentRows = db.prepare("SELECT id FROM series").all() as Array<{ id: string }>;
  let restoredSources = 0;

  const run = db.transaction(() => {
    db.prepare("DELETE FROM series").run();

    const insertSeries = db.prepare(
      `INSERT INTO series (
          id, title, total_chapters, chapters_read, start_date, finish_date, rating,
          description, personal_notes, status, content_type, reread, total_rereads, reread_sessions,
          novel_to_read, follow_updates, preferred_source_type,
          metadata_source_url, metadata_source_site, metadata_source_canonical_id, metadata_source_updated_at,
          cover_image_blob, cover_image_mime_type, cover_image_fetched_at, metadata_fetched_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSource = db.prepare(
      `INSERT INTO series_sources
           (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const item of loaded.snapshot.series) {
      const createdAt = item.createdAt || new Date().toISOString();
      const updatedAt = item.updatedAt || createdAt;
      insertSeries.run(
        item.id,
        item.title,
        item.totalChapters,
        item.chaptersRead,
        item.startDate ?? null,
        item.finishDate ?? null,
        item.rating ?? null,
        item.description,
        item.personalNotes,
        item.status,
        item.contentType ?? null,
        item.reread ? 1 : 0,
        item.totalRereads,
        JSON.stringify(item.rereadSessions),
        item.novelToRead ? 1 : 0,
        item.followUpdates ? 1 : 0,
        item.preferredSourceType,
        item.metadataSourceUrl ?? null,
        item.metadataSourceSite ?? null,
        item.metadataSourceCanonicalId ?? null,
        item.metadataSourceUpdatedAt ?? null,
        null,
        null,
        null,
        item.metadataFetchedAt ?? null,
        createdAt,
        updatedAt,
      );

      for (const source of item.sources) {
        insertSource.run(
          source.id || randomUUID(),
          item.id,
          source.type,
          source.url,
          source.site ?? null,
          source.canonicalId ?? null,
          source.scrapedAt ?? null,
          source.scraperName ?? null,
          source.lastError ? JSON.stringify(source.lastError) : null,
          source.meta ? JSON.stringify(source.meta) : null,
          createdAt,
        );
        restoredSources += 1;
      }
    }
  });

  run();

  return {
    backupId,
    restoredSeries: loaded.snapshot.series.length,
    restoredSources,
    deletedSeries: currentRows.length,
    preRestoreBackupFileName: path.basename(preRestore.path),
  };
}
