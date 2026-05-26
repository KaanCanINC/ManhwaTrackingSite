import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { Notice, OperationHistoryItem, UndoOperationResult } from "@/lib/contracts";

type Props = {
  onClose: () => void;
  onNotify: (notice: Notice) => void;
  onDataChanged: () => Promise<void> | void;
};

function actionLabel(actionType: OperationHistoryItem["actionType"]): string {
  if (actionType === "create_series") return "Series Created";
  if (actionType === "update_series") return "Series Updated";
  if (actionType === "update_chapters_read") return "Chapter Updated";
  if (actionType === "delete_series") return "Series Deleted";
  return "Undo Applied";
}

export function HistoryModal({ onClose, onNotify, onDataChanged }: Props) {
  const [items, setItems] = useState<OperationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/history?limit=50&maxAgeDays=7");
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to load operation history");
      }
      const json = (await res.json()) as { data: OperationHistoryItem[] };
      setItems(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operation history");
    } finally {
      setLoading(false);
    }
  }

  async function undo(item: OperationHistoryItem) {
    setUndoingId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/history/${item.id}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Undo failed");
      }

      const json = (await res.json()) as { data: UndoOperationResult };
      onNotify({
        tone: "success",
        message: `Undo applied for ${actionLabel(json.data.actionType)}.`,
      });
      await onDataChanged();
      await loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Undo failed";
      setError(message);
      onNotify({ tone: "error", message });
    } finally {
      setUndoingId(null);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-base font-medium text-white">Operation History</h2>
          <button
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-white"
            aria-label="Close history modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-6">
          {error && <p className="text-sm text-red-400">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400">Loading history...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400">No operations in the last 7 days.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-300">
                    <p>
                      <span className="text-gray-500">Action:</span> {actionLabel(item.actionType)}
                    </p>
                    <p>
                      <span className="text-gray-500">When:</span>{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    <p>
                      <span className="text-gray-500">Series:</span>{" "}
                      {item.titleSnapshot || item.entityId}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void undo(item)}
                      disabled={Boolean(item.undoneAt) || undoingId === item.id || item.actionType === "undo_operation"}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-cyan-500 hover:text-white disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {item.undoneAt ? "Undone" : undoingId === item.id ? "Undoing..." : "Undo"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
