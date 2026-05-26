import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  BackupListItem,
  BackupRestorePreview,
  BackupRestoreResult,
  Notice,
} from "@/lib/contracts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Props = {
  onClose: () => void;
  onRestored: () => Promise<void> | void;
  onNotify: (notice: Notice) => void;
};

export function BackupsModal({ onClose, onRestored, onNotify }: Props) {
  const [items, setItems] = useState<BackupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restorePreview, setRestorePreview] = useState<BackupRestorePreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteBackup, setPendingDeleteBackup] = useState<BackupListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadBackups() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backups");
      if (!res.ok) throw new Error("Failed to load backups");
      const json = (await res.json()) as { data: BackupListItem[] };
      setItems(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }

  async function createManualBackup() {
    setCreating(true);
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      if (!res.ok) throw new Error("Backup creation failed");
      await loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup creation failed");
    } finally {
      setCreating(false);
    }
  }

  async function openRestorePreview(backupId: string) {
    setError(null);
    setPreviewLoadingId(backupId);
    try {
      const res = await fetch(`/api/backups/${backupId}/restore/preview`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to preview restore");
      }
      const json = (await res.json()) as { data: BackupRestorePreview };
      setRestorePreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview restore");
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function applyRestore() {
    if (!restorePreview) return;
    setRestoring(true);
    setError(null);

    try {
      const res = await fetch(`/api/backups/${restorePreview.backupId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Restore failed");
      }

      const json = (await res.json()) as {
        data: BackupRestoreResult;
      };

      onNotify({
        tone: "success",
        message: `Restore complete. Restored ${json.data.restoredSeries} series. Safety backup: ${json.data.preRestoreBackupFileName}`,
      });
      setRestorePreview(null);
      await onRestored();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  async function deleteBackup(backup: BackupListItem) {
    setDeletingId(backup.id);
    setError(null);
    try {
      const res = await fetch(`/api/backups/${backup.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Backup deletion failed");
      }
      onNotify({ tone: "success", message: `Backup deleted: ${backup.fileName}` });
      setPendingDeleteBackup(null);
      await loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup deletion failed");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    void loadBackups();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-3xl rounded-xl bg-gray-900 border border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-base font-medium text-white">Backups</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label="Close backups modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex justify-end">
            <button
              onClick={() => void createManualBackup()}
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Manual Backup"}
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400">Loading backups...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400">No backups found.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                  <div className="grid gap-2 text-xs text-gray-300 md:grid-cols-[1.3fr,0.8fr,1.6fr,0.6fr]">
                    <p className="min-w-0">
                      <span className="text-gray-500">Created:</span>{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    <p className="min-w-0">
                      <span className="text-gray-500">Reason:</span> {item.reason}
                    </p>
                    <p className="min-w-0 break-all">
                      <span className="text-gray-500">File:</span> {item.fileName}
                    </p>
                    <p className="min-w-0">
                      <span className="text-gray-500">Size:</span> {formatBytes(item.sizeBytes)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`/api/backups/${item.id}/download`}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => void openRestorePreview(item.id)}
                      disabled={previewLoadingId === item.id || restoring || deletingId === item.id}
                      className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {previewLoadingId === item.id ? "Previewing..." : "Restore"}
                    </button>
                    <button
                      onClick={() => setPendingDeleteBackup(item)}
                      disabled={restoring || deletingId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {restorePreview && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-white">Restore Backup</h3>
            <p className="mt-2 text-xs text-gray-300">
              This will replace your current library with snapshot data.
            </p>

            <div className="mt-4 space-y-1 rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-xs text-gray-300">
              <p>Backup file: {restorePreview.backupFileName}</p>
              <p>Snapshot date: {new Date(restorePreview.snapshotCreatedAt).toLocaleString()}</p>
              <p>Will add: {restorePreview.toAdd}</p>
              <p>Will update: {restorePreview.toUpdate}</p>
              <p className="text-red-300">Will remove: {restorePreview.toDelete}</p>
            </div>

            <p className="mt-3 text-[11px] text-gray-400">
              A safety backup is created automatically before restore.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRestorePreview(null)}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void applyRestore()}
                disabled={restoring}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {restoring ? "Restoring..." : "Confirm Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteBackup && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-white">Delete Backup</h3>
            <p className="mt-2 text-xs text-gray-300">
              Delete <span className="font-medium text-white">{pendingDeleteBackup.fileName}</span> permanently?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDeleteBackup(null)}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteBackup(pendingDeleteBackup)}
                disabled={deletingId === pendingDeleteBackup.id}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletingId === pendingDeleteBackup.id ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
