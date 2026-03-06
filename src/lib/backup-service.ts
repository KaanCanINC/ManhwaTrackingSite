import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataPaths } from "@/lib/storage";
import { getDb } from "@/lib/db";
import { listSeries } from "@/lib/series-repository";

function maxBackups(): number {
  const parsed = Number(process.env.MAX_BACKUPS || "60");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }
  return parsed;
}

export function createBackup(reason: string): { fileName: string; path: string } {
  const db = getDb();
  const snapshot = {
    createdAt: new Date().toISOString(),
    reason,
    series: listSeries({}),
  };

  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  const filePath = path.join(dataPaths.backupsDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(snapshot), "utf8");

  db.prepare("INSERT INTO backups (id, file_name, reason, created_at) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    fileName,
    reason,
    snapshot.createdAt,
  );

  rotateBackups();
  return { fileName, path: filePath };
}

function rotateBackups(): void {
  const files = fs
    .readdirSync(dataPaths.backupsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const limit = maxBackups();
  for (const file of files.slice(limit)) {
    fs.unlinkSync(path.join(dataPaths.backupsDir, file));
  }
}

let dailyBackupCheckedDate = "";

export function runDailyBackupIfNeeded(): { created: boolean; fileName?: string } {
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

  const backup = createBackup("daily");
  dailyBackupCheckedDate = today;
  return { created: true, fileName: backup.fileName };
}

let lastChangeBackupAt = 0;
const CHANGE_BACKUP_COOLDOWN_MS = 15 * 60 * 1000;

export function createChangeBackupIfCooledDown(): void {
  const now = Date.now();
  if (now - lastChangeBackupAt < CHANGE_BACKUP_COOLDOWN_MS) {
    return;
  }
  lastChangeBackupAt = now;
  createBackup("change");
}

export type BackupListItem = {
  id: string;
  fileName: string;
  reason: string;
  createdAt: string;
  sizeBytes: number;
};

export function listBackups(): BackupListItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, file_name, reason, created_at FROM backups ORDER BY created_at DESC")
    .all() as Array<{ id: string; file_name: string; reason: string; created_at: string }>;

  return rows.map((row) => {
    const fullPath = path.join(dataPaths.backupsDir, row.file_name);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(fullPath).size;
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
  });
}

export function getBackupFileById(id: string): { fileName: string; fullPath: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT file_name FROM backups WHERE id = ? LIMIT 1")
    .get(id) as { file_name: string } | undefined;

  if (!row?.file_name) {
    return null;
  }

  const fullPath = path.join(dataPaths.backupsDir, row.file_name);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return {
    fileName: row.file_name,
    fullPath,
  };
}
