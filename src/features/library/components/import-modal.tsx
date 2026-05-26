import { useState } from "react";
import { X } from "lucide-react";
import type { ImportPreviewItem, Notice } from "@/lib/contracts";

type Props = {
  onClose: () => void;
  onDone: () => void;
  onNotify: (notice: Notice) => void;
};

export function ImportModal({ onClose, onDone, onNotify }: Props) {
  const [selectedSource, setSelectedSource] = useState<"mal" | "anilist">("mal");
  const [selectedMode, setSelectedMode] = useState<"content" | "nickname">("content");
  const [malContent, setMalContent] = useState("");
  const [aniContent, setAniContent] = useState("");
  const [malNickname, setMalNickname] = useState("");
  const [aniNickname, setAniNickname] = useState("");
  const [previewSource, setPreviewSource] = useState<"mal" | "anilist" | null>(null);
  const [previewMode, setPreviewMode] = useState<"content" | "nickname">("content");
  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function readTextFile(file: File): Promise<string> {
    return await file.text();
  }

  async function onFilePick(file: File | null) {
    if (!file) return;
    const text = await readTextFile(file);
    if (selectedSource === "mal") setMalContent(text);
    else setAniContent(text);
  }

  function currentContent(): string {
    return selectedSource === "mal" ? malContent : aniContent;
  }

  function currentNicknameValue(): string {
    return selectedSource === "mal" ? malNickname : aniNickname;
  }

  function currentNicknameTrimmed(): string {
    return currentNicknameValue().trim();
  }

  function toggleSelection(index: number) {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index],
    );
  }

  function selectAll() {
    setSelectedIndices(previewItems.map((item) => item.index));
  }

  function clearSelection() {
    setSelectedIndices([]);
  }

  function selectByStatus(group: "reading" | "plan_to_read" | "dropped" | "others") {
    const groupStatuses =
      group === "reading"
        ? new Set(["reading"])
        : group === "plan_to_read"
          ? new Set(["plan_to_read"])
          : group === "dropped"
            ? new Set(["dropped"])
            : new Set(["completed", "up_to_date"]);

    const indices = previewItems
      .filter((item) => groupStatuses.has(item.status))
      .map((item) => item.index);

    setSelectedIndices(indices);
  }

  async function runPreview() {
    const source = selectedSource;
    const mode = selectedMode;
    const content = currentContent();
    const nickname = currentNicknameTrimmed();

    if (mode === "content" && !content.trim()) {
      onNotify({ tone: "error", message: "Import content is empty." });
      return;
    }

    if (mode === "nickname" && !nickname) {
      onNotify({ tone: "error", message: "Nickname is required." });
      return;
    }

    setPreviewLoading(true);
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, mode, content, nickname }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        onNotify({ tone: "error", message: err.error || "Preview failed." });
        return;
      }

      const json = (await res.json()) as { data: { items: ImportPreviewItem[] } };
      const items = json.data.items || [];

      setPreviewSource(source);
      setPreviewMode(mode);
      setPreviewItems(items);
      setSelectedIndices(items.map((item) => item.index));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runImport() {
    if (!previewSource) {
      onNotify({ tone: "error", message: "Select a source and preview items first." });
      return;
    }

    if (previewSource !== selectedSource || previewMode !== selectedMode) {
      onNotify({
        tone: "error",
        message: "Source or mode changed after preview. Run preview again before importing.",
      });
      return;
    }

    if (selectedIndices.length === 0) {
      onNotify({ tone: "error", message: "Select at least one series to import." });
      return;
    }

    const content = currentContent();
    const nickname = currentNicknameTrimmed();
    setImporting(true);

    const res = await fetch(`/api/import/${previewSource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: previewMode, content, nickname, selectedIndices }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      onNotify({ tone: "error", message: err.error || "Import failed." });
      setImporting(false);
      return;
    }

    const data = (await res.json()) as {
      data: { added: number; merged: number; queuedEnrichment?: number };
    };
    onNotify({
      tone: "success",
      message: `Added: ${data.data.added}, merged: ${data.data.merged}. Enrichment queued: ${data.data.queuedEnrichment ?? 0}`,
    });
    setImporting(false);
    onDone();
    onClose();
  }

  const areaCls =
    "w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors";
  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-xl rounded-xl bg-gray-900 border border-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-base font-medium text-white">Import</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label="Close import modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <p className="text-xs text-gray-400">Source Platform</p>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as "mal" | "anilist")}
              className={inputCls}
            >
              <option value="mal">MyAnimeList</option>
              <option value="anilist">AniList</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-400">Import Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedMode("content")}
                className={`rounded-lg px-3 py-2 text-sm ${selectedMode === "content" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}`}
              >
                File / Content
              </button>
              <button
                onClick={() => setSelectedMode("nickname")}
                className={`rounded-lg px-3 py-2 text-sm ${selectedMode === "nickname" ? "bg-cyan-700 text-white" : "bg-gray-800 text-gray-300"}`}
              >
                Nickname
              </button>
            </div>
          </div>

          {selectedMode === "content" ? (
            <div key={`content-${selectedSource}`} className="space-y-2">
              <p className="text-xs text-gray-400">
                {selectedSource === "mal" ? "MAL XML or ManCon JSON backup/export" : "AniList JSON/XML or ManCon JSON backup/export"}
              </p>
              <input
                type="file"
                accept={
                  selectedSource === "mal"
                    ? ".xml,.json,text/xml,application/xml,application/json"
                    : ".json,.xml,application/json,text/xml,application/xml"
                }
                onChange={(e) => void onFilePick(e.target.files?.[0] || null)}
                className="block w-full cursor-pointer rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300"
              />
              <textarea
                rows={5}
                value={currentContent()}
                onChange={(e) =>
                  selectedSource === "mal" ? setMalContent(e.target.value) : setAniContent(e.target.value)
                }
                placeholder={
                  selectedSource === "mal"
                    ? "Paste MAL XML or ManCon backup/export JSON here..."
                    : "Paste AniList JSON/XML or ManCon backup/export JSON here..."
                }
                className={areaCls}
              />
            </div>
          ) : (
            <div key={`nickname-${selectedSource}`} className="space-y-2 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
              <p className="text-[11px] text-gray-400">
                {selectedSource === "mal"
                  ? "Import by public MAL nickname"
                  : "Import by public AniList nickname"}
              </p>
              <input
                value={currentNicknameValue()}
                onChange={(e) =>
                  selectedSource === "mal"
                    ? setMalNickname(String(e.target.value || ""))
                    : setAniNickname(String(e.target.value || ""))
                }
                placeholder={selectedSource === "mal" ? "MAL username" : "AniList username"}
                className={inputCls}
              />
            </div>
          )}

          <button
            onClick={() => void runPreview()}
            disabled={previewLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {previewLoading ? "Loading..." : "Preview"}
          </button>

          {previewSource && (
            <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-300">
                  Select series to import ({selectedIndices.length}/{previewItems.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={selectAll} className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white">
                    Select all
                  </button>
                  <button onClick={clearSelection} className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white">
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 rounded border border-gray-800 p-2">
                <button
                  onClick={() => selectByStatus("reading")}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white"
                >
                  Reading
                </button>
                <button
                  onClick={() => selectByStatus("plan_to_read")}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white"
                >
                  Plan To Read
                </button>
                <button
                  onClick={() => selectByStatus("dropped")}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white"
                >
                  Dropped
                </button>
                <button
                  onClick={() => selectByStatus("others")}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:text-white"
                >
                  Others
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded border border-gray-800">
                {previewItems.map((item) => (
                  <label key={`${previewSource}-${item.index}`} className="flex cursor-pointer items-center gap-2 border-b border-gray-800 px-3 py-2 text-xs text-gray-200 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selectedIndices.includes(item.index)}
                      onChange={() => toggleSelection(item.index)}
                      className="accent-blue-500"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-gray-400">{item.status}</span>
                    <span className="shrink-0 text-gray-500">{item.chaptersRead}/{item.totalChapters}</span>
                  </label>
                ))}
              </div>

              <button onClick={() => void runImport()} disabled={importing} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {importing ? "Importing..." : "Import Selected"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
