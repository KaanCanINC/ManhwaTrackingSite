"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUp, BookOpen, Download, LayoutGrid, List, Plus, RefreshCw, Shield, Star, Trash2, Upload, X } from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PreferredSourceType, Series, SeriesStatus as Status, SourceType } from "@/lib/types";
import {
  clampInt,
  coverGradient,
  ensureSessionCount,
  formatStatus,
  getPreferredSource,
  normalizeRereadSessions,
  parseSourceMeta,
  RATING_OPTIONS,
  type RereadSessionForm,
  STATUS_OPTIONS,
  statusBg,
  todayStr,
} from "@/utils/ui-utils";

type ScrapeWebsiteResponse = {
  data: {
    sourceType: SourceType;
    usedPuppeteer: boolean;
    coverDownloaded: boolean;
    metadata: {
      title: string;
      totalChapters: number | null;
      description: string;
      tags: string[];
      alternativeTitles: string[];
      canonicalId: string | null;
      site: string;
      sourceUrl: string;
      coverImageUrl: string | null;
    };
    coverImage: {
      base64: string;
      mimeType: string;
      fetchedAt: string | null;
    } | null;
  };
};

type SourceMetaOverride = {
  site: string | null;
  canonicalId: string | null;
  scrapedAt: string | null;
  scraperName: string | null;
  lastError: { message: string; timestamp: string } | null;
  meta: Record<string, unknown> | null;
};

type BackupListItem = {
  id: string;
  fileName: string;
  reason: string;
  createdAt: string;
  sizeBytes: number;
};

type BackupRestorePreview = {
  backupId: string;
  backupFileName: string;
  snapshotCreatedAt: string;
  totalInBackup: number;
  totalCurrent: number;
  toAdd: number;
  toUpdate: number;
  toDelete: number;
};

type EnrichmentStats = {
  pending: number;
  running: number;
  failed: number;
  done: number;
};

type ImportPreviewItem = {
  index: number;
  title: string;
  status: Status;
  totalChapters: number;
  chaptersRead: number;
};

type Notice = {
  tone: "success" | "error" | "info";
  message: string;
};

function resolveSourcePayload(
  type: SourceType,
  url: string,
  originalSources: Series["sources"],
  overrides: Partial<Record<SourceType, SourceMetaOverride>>,
): {
  type: SourceType;
  url: string;
  site?: string | null;
  canonicalId?: string | null;
  scrapedAt?: string | null;
  scraperName?: string | null;
  lastError?: { message: string; timestamp: string } | null;
  meta?: Record<string, unknown> | null;
} | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const base = originalSources.find((source) => source.type === type);
  const override = overrides[type];

  return {
    type,
    url: trimmed,
    site: override?.site ?? base?.site ?? null,
    canonicalId: override?.canonicalId ?? base?.canonicalId ?? null,
    scrapedAt: override?.scrapedAt ?? base?.scrapedAt ?? null,
    scraperName: override?.scraperName ?? base?.scraperName ?? null,
    lastError: override?.lastError ?? base?.lastError ?? null,
    meta: override?.meta ?? base?.meta ?? null,
  };
}

type FormState = {
  title: string;
  totalChapters: number;
  chaptersRead: number;
  status: Status;
  rating: number | "";
  description: string;
  personalNotes: string;
  reread: boolean;
  totalRereads: number;
  rereadSessions: RereadSessionForm[];
  novelToRead: boolean;
  followUpdates: boolean;
  startDate: string;
  finishDate: string;
  trUrl: string;
  enUrl: string;
  preferredSourceType: PreferredSourceType | null;
  coverImageBase64: string | null;
  coverImageMimeType: string | null;
  coverImageFetchedAt: string | null;
};

const EMPTY_FORM: FormState = {
  title: "",
  totalChapters: 0,
  chaptersRead: 0,
  status: "plan_to_read",
  rating: "",
  description: "",
  personalNotes: "",
  reread: false,
  totalRereads: 0,
  rereadSessions: [],
  novelToRead: false,
  followUpdates: true,
  startDate: "",
  finishDate: "",
  trUrl: "",
  enUrl: "",
  preferredSourceType: null,
  coverImageBase64: null,
  coverImageMimeType: null,
  coverImageFetchedAt: null,
};

function MangaCard({
  item,
  onChapter,
  onDelete,
}: {
  item: Series;
  onChapter: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}) {
  const preferredSource = getPreferredSource(item.sources, item.preferredSourceType, {
    url: item.metadataSourceUrl,
    site: item.metadataSourceSite,
    canonicalId: item.metadataSourceCanonicalId,
  });
  const preferredMeta = parseSourceMeta(preferredSource);
  const progress =
    item.totalChapters > 0 ? Math.round((item.chaptersRead / item.totalChapters) * 100) : 0;
  const isEnriching = item.enrichmentStatus === "pending" || item.enrichmentStatus === "running";

  function act(e: MouseEvent, fn: () => void) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  return (
    <Link href={`/series/${item.id}`} className="group block">
      <div className="relative overflow-hidden rounded-lg bg-gray-900 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl">
        <div className="aspect-2/3 overflow-hidden" style={{ background: coverGradient(item.title) }}>
          {item.hasCoverImage ? (
            <Image
              src={`/api/series/${item.id}/cover?u=${encodeURIComponent(item.updatedAt)}`}
              alt={`${item.title} cover`}
              width={320}
              height={480}
              unoptimized
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl font-bold tracking-widest text-white/20 transition-transform duration-300 group-hover:scale-110 select-none">
              {item.title.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black to-transparent p-4 pointer-events-none">
          <div className="space-y-2">
            <h3 className="line-clamp-2 text-sm font-medium text-white leading-snug">{item.title}</h3>
            {preferredMeta.alternativeTitles.length > 0 && (
              <p className="line-clamp-1 text-[10px] text-gray-300">
                {preferredMeta.alternativeTitles[0]}
              </p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-yellow-400">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs">{item.rating ?? "-"}</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${statusBg(item.status)}`}
              >
                {formatStatus(item.status)}
              </span>
            </div>
            {isEnriching && <p className="text-[10px] text-amber-300">Enriching metadata...</p>}
            {item.enrichmentStatus === "failed" && (
              <p className="text-[10px] text-red-300">Metadata failed. Use retry.</p>
            )}
            {item.enrichmentLastError === "ecchi_warning" && (
              <p className="text-[10px] text-amber-200">Adult warning: ecchi content detected.</p>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-white/70">
                <div className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  <span>
                    {item.chaptersRead} / {item.totalChapters}
                  </span>
                </div>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
            {item.totalRereads > 0 && (
              <p className="text-[10px] font-medium text-cyan-300">Re-reads: {item.totalRereads}</p>
            )}
          </div>
        </div>

        <div className="absolute inset-0 z-10 bg-linear-to-t from-black/90 via-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2.5">
            <p className="line-clamp-3 text-xs leading-relaxed text-white/80">
              {item.personalNotes || "Click to view details and edit."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={(e) => act(e, () => onChapter(item.id, -1))}
                className="rounded bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-white/30 transition-colors"
              >
                -1
              </button>
              <button
                onClick={(e) => act(e, () => onChapter(item.id, 1))}
                className="rounded bg-blue-600/80 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-blue-500 transition-colors"
              >
                +1
              </button>
              {preferredSource && (
                <button
                  onClick={(e) => act(e, () => window.open(preferredSource.url, "_blank", "noopener,noreferrer"))}
                  className="rounded bg-orange-600/80 px-2 py-0.5 text-xs text-white backdrop-blur hover:bg-orange-500 transition-colors"
                >
                  {preferredSource.type}
                </button>
              )}
              <button
                onClick={(e) => act(e, () => onDelete(item.id))}
                className="rounded bg-red-700/60 p-1 text-white backdrop-blur hover:bg-red-600 transition-colors"
                aria-label="Delete series"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MangaListRow({
  item,
  onChapter,
  onDelete,
}: {
  item: Series;
  onChapter: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}) {
  const preferredSource = getPreferredSource(item.sources, item.preferredSourceType, {
    url: item.metadataSourceUrl,
    site: item.metadataSourceSite,
    canonicalId: item.metadataSourceCanonicalId,
  });
  const progress = item.totalChapters > 0 ? Math.round((item.chaptersRead / item.totalChapters) * 100) : 0;
  const isEnriching = item.enrichmentStatus === "pending" || item.enrichmentStatus === "running";

  function act(e: MouseEvent, fn: () => void) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  return (
    <Link href={`/series/${item.id}`} className="block">
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 transition-colors hover:border-gray-700">
        <div className="flex gap-3">
          <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md" style={{ background: coverGradient(item.title) }}>
            {item.hasCoverImage ? (
              <Image
                src={`/api/series/${item.id}/cover?u=${encodeURIComponent(item.updatedAt)}`}
                alt={`${item.title} cover`}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xl font-bold text-white/20 select-none">
                {item.title.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-white">{item.title}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${statusBg(item.status)}`}>
                {formatStatus(item.status)}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-300">
              <span>
                {item.chaptersRead} / {item.totalChapters} ({progress}%)
              </span>
              <span className="inline-flex items-center gap-1 text-yellow-400">
                <Star className="h-3.5 w-3.5 fill-current" />
                {item.rating ?? "-"}
              </span>
            </div>

            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>

            {(isEnriching || item.enrichmentStatus === "failed" || item.enrichmentLastError === "ecchi_warning") && (
              <div className="mt-2 space-y-0.5 text-[10px]">
                {isEnriching && <p className="text-amber-300">Enriching metadata...</p>}
                {item.enrichmentStatus === "failed" && <p className="text-red-300">Metadata failed. Use retry.</p>}
                {item.enrichmentLastError === "ecchi_warning" && (
                  <p className="text-amber-200">Adult warning: ecchi content detected.</p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={(e) => act(e, () => onChapter(item.id, -1))}
                className="rounded bg-white/15 px-2 py-0.5 text-xs text-white hover:bg-white/25"
              >
                -1
              </button>
              <button
                onClick={(e) => act(e, () => onChapter(item.id, 1))}
                className="rounded bg-blue-600/80 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
              >
                +1
              </button>
              {preferredSource && (
                <button
                  onClick={(e) => act(e, () => window.open(preferredSource.url, "_blank", "noopener,noreferrer"))}
                  className="rounded bg-orange-600/80 px-2 py-0.5 text-xs text-white hover:bg-orange-500"
                >
                  {preferredSource.type}
                </button>
              )}
              <button
                onClick={(e) => act(e, () => onDelete(item.id))}
                className="rounded bg-red-700/70 px-2 py-0.5 text-xs text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AddSeriesModal({ onClose, onAdded, onNotify }: { onClose: () => void; onAdded: () => void; onNotify: (notice: Notice) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scrapingSource, setScrapingSource] = useState<SourceType | null>(null);
  const [sourceMetaOverrides, setSourceMetaOverrides] =
    useState<Partial<Record<SourceType, SourceMetaOverride>>>({});
  const [error, setError] = useState<string | null>(null);

  function f<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function updateRereadCount(nextCount: number) {
    const value = clampInt(nextCount);
    setForm((prev) => ({
      ...prev,
      totalRereads: value,
      reread: value > 0 ? true : prev.reread,
      rereadSessions: ensureSessionCount(value, prev.rereadSessions),
    }));
  }

  function updateRereadSession(index: number, key: keyof RereadSessionForm, value: string) {
    setForm((prev) => {
      const next = [...prev.rereadSessions];
      if (!next[index]) {
        return prev;
      }
      next[index] = { ...next[index], [key]: value };
      return { ...prev, rereadSessions: next };
    });
  }

  async function scrapeFromSource(sourceType: SourceType) {
    const url = sourceType === "TR" ? form.trUrl.trim() : form.enUrl.trim();
    if (!url) {
      setError(`${sourceType} source URL is required before scraping.`);
      return;
    }

    setScrapingSource(sourceType);
    setError(null);

    try {
      const res = await fetch("/api/scrape/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sourceType }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Scrape failed");
      }

      const json = (await res.json()) as ScrapeWebsiteResponse;
      const scraped = json.data;

      setSourceMetaOverrides((prev) => ({
        ...prev,
        [sourceType]: {
          site: scraped.metadata.site,
          canonicalId: scraped.metadata.canonicalId,
          scrapedAt: new Date().toISOString(),
          scraperName: "manual-source-scrape-v1",
          lastError: null,
          meta: {
            tags: scraped.metadata.tags,
            alternativeTitles: scraped.metadata.alternativeTitles,
            coverImageUrl: scraped.metadata.coverImageUrl,
          },
        },
      }));

      setForm((prev) => {
        const nextTotal =
          prev.totalChapters > 0
            ? prev.totalChapters
            : clampInt(scraped.metadata.totalChapters ?? 0);

        return {
          ...prev,
          title: scraped.metadata.title || prev.title,
          totalChapters: nextTotal,
          description: scraped.metadata.description || prev.description,
          preferredSourceType: prev.preferredSourceType ?? sourceType,
          coverImageBase64: scraped.coverImage?.base64 ?? prev.coverImageBase64,
          coverImageMimeType: scraped.coverImage?.mimeType ?? prev.coverImageMimeType,
          coverImageFetchedAt: scraped.coverImage?.fetchedAt ?? prev.coverImageFetchedAt,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setScrapingSource(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const trSource = resolveSourcePayload("TR", form.trUrl, [], sourceMetaOverrides);
    const enSource = resolveSourcePayload("EN", form.enUrl, [], sourceMetaOverrides);
    const sources = [trSource, enSource].filter(Boolean);

    const preferredExists = form.preferredSourceType
      ? form.preferredSourceType === "MAL"
        ? sources.some((source) => source?.site === "myanimelist")
        : form.preferredSourceType === "ANILIST"
          ? sources.some((source) => source?.site === "anilist")
          : sources.some((source) => source?.type === form.preferredSourceType)
      : false;

    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        totalChapters: clampInt(form.totalChapters),
        chaptersRead: clampInt(form.chaptersRead),
        status: form.status,
        rating: form.rating === "" ? null : Number(form.rating),
        description: form.description,
        personalNotes: form.personalNotes,
        reread: form.reread || form.totalRereads > 0,
        totalRereads: clampInt(form.totalRereads),
        rereadSessions: normalizeRereadSessions(form.rereadSessions),
        novelToRead: form.novelToRead,
        followUpdates: form.followUpdates,
        preferredSourceType: preferredExists ? form.preferredSourceType : null,
        startDate: form.startDate || null,
        finishDate: form.finishDate || null,
        sources,
        coverImageBase64: form.coverImageBase64,
        coverImageMimeType: form.coverImageMimeType,
        coverImageFetchedAt: form.coverImageFetchedAt,
        metadataFetchedAt: new Date().toISOString(),
      }),
    });

    setSaving(false);

    if (res.ok) {
      onAdded();
      onClose();
      return;
    }

    const err = (await res.json()) as unknown;
    onNotify({ tone: "error", message: `Add failed: ${JSON.stringify(err)}` });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors";
  const labelCls = "block text-xs text-gray-400 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center p-4">
      <div className="w-full max-w-2xl rounded-xl bg-gray-900 border border-gray-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-base font-medium text-white">Add Series</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label="Close add series modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Title *</label>
            <input required value={form.title} onChange={(e) => f("title", e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Total Chapters</label>
            <input
              type="number"
              min={0}
              value={form.totalChapters}
              onChange={(e) => f("totalChapters", clampInt(Number(e.target.value)))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Chapters Read</label>
            <input
              type="number"
              min={0}
              value={form.chaptersRead}
              onChange={(e) => f("chaptersRead", clampInt(Number(e.target.value)))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={(e) => f("status", e.target.value as Status)} className={inputCls}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Rating</label>
            <select
              value={form.rating === "" ? "" : String(form.rating)}
              onChange={(e) => f("rating", e.target.value ? Number(e.target.value) : "")}
              className={inputCls}
            >
              <option value="">Not rated</option>
              {RATING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Preferred Library Source</label>
            <select
              value={form.preferredSourceType || ""}
              onChange={(e) =>
                f("preferredSourceType", (e.target.value ? (e.target.value as PreferredSourceType) : null) as PreferredSourceType | null)
              }
              className={inputCls}
            >
              <option value="">Auto</option>
              <option value="TR">TR</option>
              <option value="EN">EN</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Start Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => f("startDate", e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => f("startDate", todayStr())}
                className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:border-blue-500 hover:text-white transition-colors"
              >
                Today
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Finish Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={form.finishDate}
                onChange={(e) => f("finishDate", e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => f("finishDate", todayStr())}
                className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-300 hover:border-blue-500 hover:text-white transition-colors"
              >
                Today
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Total Times Re-read</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.totalRereads}
              onChange={(e) => updateRereadCount(Number(e.target.value))}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Synopsis (auto-filled from source)</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => f("description", e.target.value)}
              placeholder="Source synopsis..."
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Personal Notes</label>
            <textarea
              rows={3}
              value={form.personalNotes}
              onChange={(e) => f("personalNotes", e.target.value)}
              placeholder="Add your thoughts, synopsis, or any notes..."
              className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {form.totalRereads > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
              <p className="mb-3 text-xs font-medium text-cyan-300">Re-read Date Ranges (optional)</p>
              <div className="space-y-3">
                {form.rereadSessions.map((session, index) => (
                  <div key={`reread-${index}`} className="grid gap-2 sm:grid-cols-[1fr,1fr,auto,auto]">
                    <input
                      type="date"
                      value={session.startDate}
                      onChange={(e) => updateRereadSession(index, "startDate", e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="date"
                      value={session.finishDate}
                      onChange={(e) => updateRereadSession(index, "finishDate", e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => updateRereadSession(index, "startDate", todayStr())}
                      className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white"
                    >
                      Start Today
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRereadSession(index, "finishDate", todayStr())}
                      className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white"
                    >
                      Finish Today
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className={labelCls}>Turkish Source</label>
            <input value={form.trUrl} onChange={(e) => f("trUrl", e.target.value)} placeholder="https://..." className={inputCls} />
            <button
              type="button"
              disabled={scrapingSource === "TR" || !form.trUrl.trim()}
              onClick={() => void scrapeFromSource("TR")}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scrapingSource === "TR" ? "animate-spin" : ""}`} />
              Fetch TR Metadata
            </button>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>English Source</label>
            <input value={form.enUrl} onChange={(e) => f("enUrl", e.target.value)} placeholder="https://..." className={inputCls} />
            <button
              type="button"
              disabled={scrapingSource === "EN" || !form.enUrl.trim()}
              onClick={() => void scrapeFromSource("EN")}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scrapingSource === "EN" ? "animate-spin" : ""}`} />
              Fetch EN Metadata
            </button>
          </div>

          {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}

          <div className="sm:col-span-2 flex flex-wrap gap-5">
            {[
              { key: "reread" as const, label: "Reread" },
              { key: "novelToRead" as const, label: "Novel to Read" },
              { key: "followUpdates" as const, label: "Follow Updates" },
            ].map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form[key]} onChange={(e) => f(key, e.target.checked)} className="accent-blue-500" />
                {label}
              </label>
            ))}
          </div>

          <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : "Add Series"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportModal({
  onClose,
  onDone,
  onNotify,
}: {
  onClose: () => void;
  onDone: () => void;
  onNotify: (notice: Notice) => void;
}) {
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
        onNotify({ tone: "error", message: "Preview failed." });
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
      onNotify({ tone: "error", message: "Import failed." });
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
                {selectedSource === "mal" ? "MAL XML" : "AniList JSON or XML"}
              </p>
              <input
                type="file"
                accept={
                  selectedSource === "mal"
                    ? ".xml,text/xml,application/xml"
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
                    ? "Paste MAL export XML here..."
                    : "Paste AniList export JSON/XML here..."
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function BackupsModal({
  onClose,
  onRestored,
  onNotify,
}: {
  onClose: () => void;
  onRestored: () => void;
  onNotify: (notice: Notice) => void;
}) {
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
        data: {
          restoredSeries: number;
          deletedSeries: number;
          preRestoreBackupFileName: string;
        };
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

export default function Home() {
  const [items, setItems] = useState<Series[]>([]);
  const itemsRef = useRef<Series[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [enrichmentStats, setEnrichmentStats] = useState<EnrichmentStats>({
    pending: 0,
    running: 0,
    failed: 0,
    done: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [enrichmentFilter, setEnrichmentFilter] = useState<"all" | "enriching" | "failed">("all");
  const [query, setQuery] = useState("");
  const [flagFilter, setFlagFilter] = useState<"none" | "reread" | "novel" | "follow">("none");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showGoTop, setShowGoTop] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function fetchSeriesList(
    activeQuery: string,
    activeStatus: Status | "all",
    activeFlag: "none" | "reread" | "novel" | "follow",
  ) {
    const params = new URLSearchParams();
    if (activeQuery.trim()) params.set("query", activeQuery.trim());
    if (activeStatus !== "all") params.set("status", activeStatus);
    if (activeFlag === "reread") params.set("reread", "true");
    if (activeFlag === "novel") params.set("novelToRead", "true");
    if (activeFlag === "follow") params.set("followUpdates", "true");

    const res = await fetch(`/api/series?${params.toString()}`);
    const json = (await res.json()) as {
      data?: Series[];
      meta?: { statusCounts?: Record<string, number> };
    };
    return {
      items: json.data ?? [],
      statusCounts: json.meta?.statusCounts ?? {},
    };
  }

  async function refresh() {
    const [result, statsRes] = await Promise.all([
      fetchSeriesList(query, statusFilter, flagFilter),
      fetch("/api/import/enrichment/stats"),
    ]);

    setItems(result.items);
    setStatusCounts(result.statusCounts);

    if (statsRes.ok) {
      const json = (await statsRes.json()) as { data: EnrichmentStats };
      setEnrichmentStats(json.data);
    }

    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [result, statsRes] = await Promise.all([
        fetchSeriesList(query, statusFilter, flagFilter),
        fetch("/api/import/enrichment/stats"),
      ]);
      if (!cancelled) {
        setItems(result.items);
        setStatusCounts(result.statusCounts);
        if (statsRes.ok) {
          const json = (await statsRes.json()) as { data: EnrichmentStats };
          setEnrichmentStats(json.data);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, statusFilter, flagFilter]);

  useEffect(() => {
    const hasPendingEnrichment = itemsRef.current.some(
      (item) => item.enrichmentStatus === "pending" || item.enrichmentStatus === "running",
    );

    if (!hasPendingEnrichment) {
      return;
    }

    const id = setInterval(() => {
      void (async () => {
        const [result, statsRes] = await Promise.all([
          fetchSeriesList(query, statusFilter, flagFilter),
          fetch("/api/import/enrichment/stats"),
        ]);
        setItems(result.items);
        setStatusCounts(result.statusCounts);
        if (statsRes.ok) {
          const json = (await statsRes.json()) as { data: EnrichmentStats };
          setEnrichmentStats(json.data);
        }
      })();
    }, 5000);

    return () => clearInterval(id);
  }, [query, statusFilter, flagFilter]);

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
    if (enrichmentFilter === "all") {
      return items;
    }
    if (enrichmentFilter === "enriching") {
      return items.filter((item) => item.enrichmentStatus === "pending" || item.enrichmentStatus === "running");
    }
    return items.filter((item) => item.enrichmentStatus === "failed");
  }, [items, enrichmentFilter]);

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
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const next = clampInt(item.chaptersRead + delta);
    const res = await fetch(`/api/series/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chaptersRead: next }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: Series };
      setItems((prev) => prev.map((i) => (i.id === id ? json.data : i)));
    }
  }

  async function deleteOne(id: string) {
    await fetch(`/api/series/${id}`, { method: "DELETE" });
    await refresh();
    setNotice({ tone: "success", message: "Series deleted." });
  }

  async function exportMal() {
    const res = await fetch("/api/export/mal");
    const text = await res.text();
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setNotice({ tone: "success", message: "MAL XML exported and copied to clipboard." });
  }

  const allTabs: Array<{ value: Status | "all"; label: string }> = [
    { value: "all", label: "All" },
    ...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
  ];

  const tabCount = (value: Status | "all") =>
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
            <span>{notice.message}</span>
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
                alt="Panel Shelf logo"
                width={52}
                height={52}
                className="h-30 w-30 rounded-md object-cover"
                priority
              />
              <span>My Library</span>
            </h1>
            <p className="text-gray-400">Track your manga and manhwa reading progress</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowImport(true)} className={outlineBtn}>
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button onClick={() => void exportMal()} className={outlineBtn}>
              <Download className="h-4 w-4" />
              Export MAL
            </button>
            <button onClick={() => setShowBackups(true)} className={outlineBtn}>
              <Shield className="h-4 w-4" />
              Backup
            </button>
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
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === tab.value ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label} ({tabCount(tab.value)})
              </button>
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
                onChapter={(id, delta) => void changeChapter(id, delta)}
                onDelete={(id) => setPendingDeleteId(id)}
              />
            ))}
          </div>
        )}
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
