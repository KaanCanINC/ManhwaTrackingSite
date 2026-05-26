import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import type { Series } from "@/lib/types";
import { coverGradient } from "@/utils/ui-utils";

type Props = {
  collectionName: string;
  allSeries: Series[];
  existingSeriesIds: string[];
  onClose: () => void;
  onSubmit: (seriesIds: string[]) => Promise<void>;
};

export function CollectionAddItemsModal({
  collectionName,
  allSeries,
  existingSeriesIds,
  onClose,
  onSubmit,
}: Props) {
  const [query, setQuery] = useState("");
  const [pickerMode, setPickerMode] = useState<"list" | "grid">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(() => new Set(existingSeriesIds), [existingSeriesIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allSeries;
    }
    return allSeries.filter((series) => series.title.toLowerCase().includes(q));
  }, [allSeries, query]);

  const addable = filtered.filter((series) => !existing.has(series.id));

  function toggleSelection(seriesId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const series of addable) {
        next.add(series.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (selected.size === 0) {
      setError("En az bir içerik seçmelisin.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(Array.from(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Koleksiyona ekleme başarısız.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            + Ekle • {collectionName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-white"
            aria-label="Close add items modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İçerik ara..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:text-white"
            >
              Görünenleri Seç
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:text-white"
            >
              Seçimi Temizle
            </button>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-700">
              <button
                type="button"
                onClick={() => setPickerMode("grid")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${pickerMode === "grid" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setPickerMode("list")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs ${pickerMode === "list" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"}`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>
            <p className="ml-auto text-xs text-gray-400">Seçilen: {selected.size}</p>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/40 p-2">
            {addable.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-gray-500">
                Eklenebilir içerik bulunamadı.
              </p>
            ) : pickerMode === "grid" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {addable.map((series) => {
                  const isSelected = selected.has(series.id);
                  return (
                    <button
                      key={series.id}
                      type="button"
                      onClick={() => toggleSelection(series.id)}
                      className={`overflow-hidden rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-blue-500 ring-1 ring-blue-500"
                          : "border-gray-700 hover:border-gray-500"
                      }`}
                    >
                      <div className="relative aspect-2/3" style={{ background: coverGradient(series.title) }}>
                        {series.hasCoverImage ? (
                          <Image
                            src={`/api/series/${series.id}/cover?u=${encodeURIComponent(series.updatedAt)}`}
                            alt={`${series.title} cover`}
                            width={160}
                            height={240}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl font-bold text-white/25 select-none">
                            {series.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute left-2 top-2">
                          <input
                            type="checkbox"
                            readOnly
                            checked={isSelected}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                          />
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="truncate text-xs font-medium text-gray-100">{series.title}</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {series.chaptersRead}/{series.totalChapters}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {addable.map((series) => (
                  <label
                    key={series.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-800/60"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(series.id)}
                      onChange={() => toggleSelection(series.id)}
                      className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                    />
                    <span className="truncate">{series.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Ekleniyor..." : "Seçilenleri Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
