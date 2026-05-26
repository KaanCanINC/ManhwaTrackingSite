"use client";

import Image from "next/image";
import {
  ArrowUp,
  BookOpen,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Shuffle,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { Notice } from "@/lib/contracts";
import type { Series, SeriesStatus } from "@/lib/types";
import { AddSeriesModal } from "@/features/library/components/add-series-modal";
import { BackupsModal } from "@/features/library/components/backups-modal";
import { CollectionAddItemsModal } from "@/features/library/components/collection-add-items-modal";
import { GoalsModal } from "@/features/library/components/goals-modal";
import { GoalsPanel } from "@/features/library/components/goals-panel";
import { ImportModal } from "@/features/library/components/import-modal";
import { MangaCard } from "@/features/library/components/manga-card";
import { MangaListRow } from "@/features/library/components/manga-list-row";
import { HistoryModal } from "@/features/library/components/history-modal";
import { SaveViewModal } from "@/features/library/components/save-view-modal";
import { useGoalsData } from "@/features/library/hooks/use-goals-data";
import { useLibraryData } from "@/features/library/hooks/use-library-data";
import { useSavedViews } from "@/features/library/hooks/use-saved-views";
import { coverGradient, STATUS_OPTIONS } from "@/utils/ui-utils";

export default function Home() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<SeriesStatus | "all">("all");
  const [enrichmentFilter, setEnrichmentFilter] = useState<"all" | "enriching" | "failed">("all");
  const [query, setQuery] = useState("");
  const [flagFilter, setFlagFilter] = useState<"none" | "reread" | "novel" | "follow">("none");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showGoTop, setShowGoTop] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showCollectionsTab, setShowCollectionsTab] = useState(false);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [showAddItemsModal, setShowAddItemsModal] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [allSeriesCache, setAllSeriesCache] = useState<Series[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [randomOpening, setRandomOpening] = useState(false);

  const {
    items,
    statusCounts,
    enrichmentStats,
    loading,
    refresh,
    updateChapterOptimistic,
    deleteSeriesOptimistic,
  } = useLibraryData(
    query,
    statusFilter,
    flagFilter,
  );

  const {
    collections,
    createCollectionView,
    addItemsToCollection,
    deleteView,
  } = useSavedViews();

  const { goals, summary: goalsSummary, upsertGoal, removeGoal } = useGoalsData();

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId) ?? null,
    [collections, activeCollectionId],
  );

  const collectionTagsBySeries = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const collection of collections) {
      for (const seriesId of collection.collectionSeriesIds) {
        const existing = map.get(seriesId) ?? [];
        existing.push(collection.name);
        map.set(seriesId, existing);
      }
    }
    return map;
  }, [collections]);

  const allSeriesById = useMemo(
    () => new Map(allSeriesCache.map((series) => [series.id, series])),
    [allSeriesCache],
  );

  useEffect(() => {
    function onScroll() {
      setShowGoTop(window.scrollY > 320);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function retryFailedEnrichment() {
    const res = await fetch("/api/import/enrichment/retry-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 300 }),
    });

    if (!res.ok) {
      setNotice({ tone: "error", message: "Failed to retry enrichment jobs." });
      return;
    }

    const json = (await res.json()) as { data: { retried: number } };
    setNotice({ tone: "info", message: `Retried ${json.data.retried} failed enrichment jobs.` });
    await refresh();
  }

  const visibleItems = useMemo(() => {
    const collectionSet = activeCollection ? new Set(activeCollection.collectionSeriesIds) : null;

    if (enrichmentFilter === "all") {
      return collectionSet ? items.filter((item) => collectionSet.has(item.id)) : items;
    }
    if (enrichmentFilter === "enriching") {
      const filtered = items.filter(
        (item) => item.enrichmentStatus === "pending" || item.enrichmentStatus === "running",
      );
      return collectionSet ? filtered.filter((item) => collectionSet.has(item.id)) : filtered;
    }
    const filtered = items.filter((item) => item.enrichmentStatus === "failed");
    return collectionSet ? filtered.filter((item) => collectionSet.has(item.id)) : filtered;
  }, [items, enrichmentFilter, activeCollection]);

  const summary = useMemo(
    () => ({
      total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      reading: statusCounts.reading ?? 0,
      completed: statusCounts.completed ?? 0,
      plan: statusCounts.plan_to_read ?? 0,
    }),
    [statusCounts],
  );

  async function changeChapter(id: string, delta: number) {
    try {
      const operationId = await updateChapterOptimistic(id, delta);
      if (operationId) {
        setNotice({
          tone: "success",
          message: "Chapter updated.",
          action: { label: "Undo", operationId },
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Chapter update failed.",
      });
    }
  }

  async function deleteOne(id: string) {
    try {
      const operationId = await deleteSeriesOptimistic(id);
      setNotice({
        tone: "success",
        message: "Series deleted.",
        action: operationId ? { label: "Undo", operationId } : undefined,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Delete failed.",
      });
    }
  }

  async function undoOperation(operationId: string) {
    const res = await fetch(`/api/history/${operationId}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice({ tone: "error", message: err.error || "Undo failed." });
      return;
    }

    await refresh();
    setNotice({ tone: "success", message: "Undo applied." });
  }

  function clearActiveCollection() {
    setActiveCollectionId(null);
  }

  function openCollection(collectionId: string) {
    setShowCollectionsTab(false);
    setQuery("");
    setStatusFilter("all");
    setFlagFilter("none");
    setActiveCollectionId(collectionId);

    const picked = collections.find((collection) => collection.id === collectionId);
    if (picked) {
      setNotice({ tone: "info", message: `Collection opened: ${picked.name}` });
    }
  }

  async function createCollection(name: string) {
    setSavingView(true);
    try {
      const created = await createCollectionView(name, []);
      setActiveCollectionId(created.id);
      setShowCreateCollection(false);
      setNotice({ tone: "success", message: "Collection created." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to create collection.",
      });
    } finally {
      setSavingView(false);
    }
  }

  async function deleteCollection(id: string) {
    try {
      await deleteView(id);
      if (activeCollectionId === id) {
        clearActiveCollection();
      }
      setNotice({ tone: "success", message: "Collection removed." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to delete collection.",
      });
    }
  }

  async function openAddItemsModal(collectionId?: string) {
    const targetCollectionId = collectionId ?? activeCollection?.id ?? null;
    if (!targetCollectionId) {
      return;
    }

    if (activeCollectionId !== targetCollectionId) {
      setActiveCollectionId(targetCollectionId);
    }

    try {
      if (allSeriesCache.length === 0) {
        const res = await fetch("/api/series");
        if (!res.ok) {
          throw new Error("Could not load all series for picker.");
        }
        const json = (await res.json()) as { data?: Series[] };
        setAllSeriesCache(json.data ?? []);
      }

      setShowAddItemsModal(true);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load series picker.",
      });
    }
  }

  async function addItemsToActiveCollection(seriesIds: string[]) {
    if (!activeCollection) {
      return;
    }

    const result = await addItemsToCollection(activeCollection.id, seriesIds);
    setShowAddItemsModal(false);
    setNotice({
      tone: "success",
      message: `Added ${result.inserted} item(s) to ${activeCollection.name}${result.skipped > 0 ? ` (${result.skipped} already existed)` : ""}.`,
    });
  }

  async function openCollectionsTab() {
    setShowCollectionsTab(true);
    setActiveCollectionId(null);

    if (allSeriesCache.length > 0) {
      return;
    }

    try {
      const res = await fetch("/api/series");
      if (!res.ok) {
        throw new Error("Could not load series for collection previews.");
      }
      const json = (await res.json()) as { data?: Series[] };
      setAllSeriesCache(json.data ?? []);
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load series for collection previews.",
      });
    }
  }

  async function exportMal() {
    try {
      const res = await fetch("/api/export/mal");
      if (!res.ok) {
        throw new Error("MAL export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileNameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = fileNameMatch?.[1] || `mal-export-${Date.now()}.xml`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setNotice({ tone: "success", message: "MAL export downloaded." });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "MAL export failed",
      });
    }
  }

  async function exportFullJson() {
    try {
      const res = await fetch("/api/export/full");
      if (!res.ok) {
        throw new Error("Full export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileNameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = fileNameMatch?.[1] || `full-export-${Date.now()}.json`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setNotice({ tone: "success", message: "Full JSON export downloaded." });
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Full export failed",
      });
    }
  }

  async function openRandomPlanToRead() {
    setRandomOpening(true);
    try {
      const res = await fetch("/api/series?status=plan_to_read");
      if (!res.ok) {
        throw new Error("Could not load Plan to Read list.");
      }

      const json = (await res.json()) as { data?: Series[] };
      const candidates = json.data ?? [];

      if (candidates.length === 0) {
        setNotice({ tone: "info", message: "No Plan to Read series found." });
        return;
      }

      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      router.push(`/series/${picked.id}`);
    } catch (err) {
      setNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Random pick failed.",
      });
    } finally {
      setRandomOpening(false);
    }
  }

  const allTabs: Array<{ value: SeriesStatus | "all"; label: string }> = [
    { value: "all", label: "All" },
    ...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
  ];

  const tabCount = (value: SeriesStatus | "all") =>
    value === "all"
      ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
      : (statusCounts[value] ?? 0);

  const outlineBtn =
    "flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-2 text-sm text-gray-300 backdrop-blur transition-colors hover:border-gray-500 hover:text-white";

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {notice && (
          <div className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-800 bg-red-950/40 text-red-200" : notice.tone === "success" ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-blue-800 bg-blue-950/40 text-blue-200"}`}>
            <div className="flex items-center gap-3">
              <span>{notice.message}</span>
              {notice.action && (
                <button
                  onClick={() => void undoOperation(notice.action!.operationId)}
                  className="rounded border border-gray-600 px-2 py-0.5 text-xs text-white hover:border-cyan-400"
                >
                  {notice.action.label}
                </button>
              )}
            </div>
            <button onClick={() => setNotice(null)} className="text-gray-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 flex items-center gap-3 text-3xl font-medium sm:text-4xl">
              <Image
                src="/logo.png"
                alt="ManCon logo"
                width={52}
                height={52}
                className="h-20 w-20 rounded-md object-cover"
                priority
              />
              <span>ManCon</span>
            </h1>
            <p className="text-gray-400">Track your manga and manhwa reading progress</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void openRandomPlanToRead()}
              disabled={randomOpening}
              className="rainbow-random-btn flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Shuffle className="h-4 w-4" />
              {randomOpening ? "Picking..." : "Random"}
            </button>
            <button onClick={() => setShowBackups(true)} className={outlineBtn}>
              <Shield className="h-4 w-4" />
              Backup
            </button>
            <button onClick={() => setShowHistory(true)} className={outlineBtn}>
              <RotateCcw className="h-4 w-4" />
              History
            </button>
            <div className="relative">
              <button
                onClick={() => setShowToolsMenu((prev) => !prev)}
                className={outlineBtn}
                aria-label="Open tools menu"
              >
                <Settings className="h-4 w-4" />
              </button>
              {showToolsMenu && (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-700 bg-gray-900 p-1.5 shadow-2xl">
                  <button
                    onClick={() => {
                      setShowImport(true);
                      setShowToolsMenu(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800"
                  >
                    Import
                  </button>
                  <button
                    onClick={() => {
                      void exportMal();
                      setShowToolsMenu(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800"
                  >
                    Export MAL
                  </button>
                  <button
                    onClick={() => {
                      void exportFullJson();
                      setShowToolsMenu(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800"
                  >
                    Export Full
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Add Manga
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: summary.total },
            { label: "Reading", value: summary.reading },
            { label: "Completed", value: summary.completed },
            { label: "Plan to Read", value: summary.plan },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 backdrop-blur">
              <p className="text-xs text-gray-400">{stat.label}</p>
              <p className="mt-1 text-2xl font-medium">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title..."
            className="min-w-50 flex-1 rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-2 text-sm text-white placeholder-gray-500 outline-none backdrop-blur transition-colors focus:border-blue-500"
          />
          <select
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value as typeof flagFilter)}
            className="rounded-lg border border-gray-700 bg-gray-900/50 px-3 py-2 text-sm text-gray-300 outline-none backdrop-blur transition-colors focus:border-blue-500"
          >
            <option value="none">No flag filter</option>
            <option value="reread">Reread</option>
            <option value="novel">Novel to Read</option>
            <option value="follow">Follow Updates</option>
          </select>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/50 p-2 backdrop-blur">
          <div className="flex flex-1 flex-wrap gap-1">
            {allTabs.map((tab) => (
              <Fragment key={tab.value}>
                <button
                  onClick={() => {
                    setStatusFilter(tab.value);
                    setShowCollectionsTab(false);
                    setActiveCollectionId(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    statusFilter === tab.value ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.label} ({tabCount(tab.value)})
                </button>
                {tab.value === "dropped" && (
                  <button
                    onClick={() => void openCollectionsTab()}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      showCollectionsTab
                        ? "bg-emerald-700 text-white"
                        : "text-emerald-300/90 hover:text-white"
                    }`}
                  >
                    Collections ({collections.length})
                  </button>
                )}
              </Fragment>
            ))}
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-gray-700">
            <button
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs ${viewMode === "grid" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"}`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>

        {showCollectionsTab ? (
          <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">Collections</p>
                <p className="text-xs text-gray-400">Koleksiyon seçerek direkt içerik listesine geçebilirsin.</p>
              </div>
              <button
                onClick={() => setShowCreateCollection(true)}
                className="rounded-lg border border-emerald-600/70 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-500 hover:text-white"
              >
                + Collection
              </button>
            </div>

            {collections.length === 0 ? (
              <p className="rounded-lg border border-gray-800 bg-gray-950/50 px-4 py-6 text-center text-sm text-gray-500">
                Henüz koleksiyon yok.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => {
                  const preview = collection.collectionSeriesIds
                    .slice(0, 4)
                    .map((id) => allSeriesById.get(id))
                    .filter((item): item is Series => Boolean(item));

                  return (
                    <div
                      key={collection.id}
                      className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950/50"
                    >
                      <div className="grid grid-cols-2 grid-rows-2 gap-1 bg-gray-900 p-1">
                        {Array.from({ length: 4 }).map((_, index) => {
                          const series = preview[index];

                          if (!series) {
                            return (
                              <div
                                key={`${collection.id}-placeholder-${index}`}
                                className="aspect-3/4 rounded-md border border-gray-800 bg-gray-900"
                              />
                            );
                          }

                          return (
                            <div
                              key={`${collection.id}-preview-${series.id}`}
                              className="aspect-3/4 overflow-hidden rounded-md"
                              style={{ background: coverGradient(series.title) }}
                            >
                              {series.hasCoverImage ? (
                                <Image
                                  src={`/api/series/${series.id}/cover?u=${encodeURIComponent(series.updatedAt)}`}
                                  alt={`${series.title} cover`}
                                  width={150}
                                  height={200}
                                  unoptimized
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-lg font-bold text-white/25 select-none">
                                  {series.title.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-2 p-3">
                        <div>
                          <p className="truncate text-sm font-medium text-white">{collection.name}</p>
                          <p className="text-xs text-gray-400">
                            {collection.collectionSeriesIds.length} item(s)
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openCollection(collection.id)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Aç
                          </button>
                          <button
                            onClick={() => {
                              void openAddItemsModal(collection.id);
                            }}
                            className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:text-white"
                          >
                            + Ekle
                          </button>
                          <button
                            onClick={() => void deleteCollection(collection.id)}
                            className="rounded-lg border border-red-700/80 px-2.5 py-1 text-xs text-red-300 hover:border-red-600 hover:text-red-200"
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {activeCollection && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-700/60 bg-emerald-950/25 p-3">
                <div>
                  <p className="text-xs text-emerald-300">Collection View</p>
                  <p className="text-sm text-emerald-100">
                    {activeCollection.name} ({activeCollection.collectionSeriesIds.length})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void openAddItemsModal(activeCollection.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    + Ekle
                  </button>
                  <button
                    onClick={() => void deleteCollection(activeCollection.id)}
                    className="rounded-lg border border-red-700/80 px-3 py-1.5 text-xs text-red-300 hover:border-red-600 hover:text-red-200"
                  >
                    Koleksiyonu Sil
                  </button>
                  <button
                    onClick={clearActiveCollection}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setEnrichmentFilter("all")}
                  className={`rounded-lg px-3 py-1.5 text-xs ${enrichmentFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setEnrichmentFilter("enriching")}
                  className={`rounded-lg px-3 py-1.5 text-xs ${enrichmentFilter === "enriching" ? "bg-amber-600 text-white" : "bg-gray-800 text-gray-300"}`}
                >
                  Enriching ({enrichmentStats.pending + enrichmentStats.running})
                </button>
                <button
                  onClick={() => setEnrichmentFilter("failed")}
                  className={`rounded-lg px-3 py-1.5 text-xs ${enrichmentFilter === "failed" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"}`}
                >
                  Failed ({enrichmentStats.failed})
                </button>
              </div>

              <button
                onClick={() => void retryFailedEnrichment()}
                disabled={enrichmentStats.failed === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry failed enrichment
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20 text-gray-400">Loading...</div>
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <BookOpen className="mb-3 h-10 w-10" />
                <p>No series found for this filter.</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((item) => (
                  <MangaCard
                    key={item.id}
                    item={item}
                    collectionTags={collectionTagsBySeries.get(item.id) ?? []}
                    onChapter={(id, delta) => void changeChapter(id, delta)}
                    onDelete={(id) => setPendingDeleteId(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map((item) => (
                  <MangaListRow
                    key={item.id}
                    item={item}
                    collectionTags={collectionTagsBySeries.get(item.id) ?? []}
                    onChapter={(id, delta) => void changeChapter(id, delta)}
                    onDelete={(id) => setPendingDeleteId(id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-8">
          <GoalsPanel
            weeklyChapter={goalsSummary.weeklyChapter}
            monthlyChapter={goalsSummary.monthlyChapter}
            monthlyCompleted={goalsSummary.monthlyCompleted}
            onOpenGoalsModal={() => setShowGoalsModal(true)}
          />
        </div>
      </div>

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-sm text-gray-200">Delete this series?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingDeleteId(null)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = pendingDeleteId;
                  setPendingDeleteId(null);
                  if (id) {
                    void deleteOne(id);
                  }
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && <AddSeriesModal onClose={() => setShowAdd(false)} onAdded={() => void refresh()} onNotify={setNotice} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => void refresh()} onNotify={setNotice} />}
      {showBackups && (
        <BackupsModal
          onClose={() => setShowBackups(false)}
          onRestored={refresh}
          onNotify={setNotice}
        />
      )}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onNotify={setNotice}
          onDataChanged={refresh}
        />
      )}
      {showCreateCollection && (
        <SaveViewModal
          mode="collection"
          defaultName={`Collection ${new Date().toLocaleDateString()}`}
          busy={savingView}
          onClose={() => setShowCreateCollection(false)}
          onConfirm={createCollection}
        />
      )}
      {showAddItemsModal && activeCollection && (
        <CollectionAddItemsModal
          collectionName={activeCollection.name}
          allSeries={allSeriesCache}
          existingSeriesIds={activeCollection.collectionSeriesIds}
          onClose={() => setShowAddItemsModal(false)}
          onSubmit={addItemsToActiveCollection}
        />
      )}
      {showGoalsModal && (
        <GoalsModal
          goals={goals}
          onClose={() => setShowGoalsModal(false)}
          onSave={(metric, target) => upsertGoal(metric, target)}
          onRemove={(metric) => removeGoal(metric)}
        />
      )}

      {showGoTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed right-4 bottom-4 z-40 rounded-full border border-gray-700 bg-gray-900/90 p-3 text-gray-200 shadow-lg transition-colors hover:border-blue-500 hover:text-white sm:right-6 sm:bottom-6"
          aria-label="Go to top"
          title="Go to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
