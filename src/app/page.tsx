"use client";

import Link from "next/link";
import { BookOpen, Download, Plus, RefreshCw, Shield, Star, Upload, X } from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import type { Series, SeriesStatus as Status, SourceType } from "@/lib/types";
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
} from "@/lib/ui-utils";

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
  preferredSourceType: SourceType | null;
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
  const preferredSource = getPreferredSource(item.sources, item.preferredSourceType);
  const preferredMeta = parseSourceMeta(preferredSource);
  const progress =
    item.totalChapters > 0 ? Math.round((item.chaptersRead / item.totalChapters) * 100) : 0;

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
            <img
              src={`/api/series/${item.id}/cover?u=${encodeURIComponent(item.updatedAt)}`}
              alt={`${item.title} cover`}
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

function AddSeriesModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
      ? sources.some((source) => source?.type === form.preferredSourceType)
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
    alert(JSON.stringify(err));
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
                f("preferredSourceType", (e.target.value ? (e.target.value as SourceType) : null) as SourceType | null)
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

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [malContent, setMalContent] = useState("");
  const [aniContent, setAniContent] = useState("");

  async function runImport(source: "mal" | "anilist") {
    const content = source === "mal" ? malContent : aniContent;
    if (!content.trim()) {
      alert("Paste content first.");
      return;
    }

    const res = await fetch(`/api/import/${source}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      alert("Import failed.");
      return;
    }

    const data = (await res.json()) as { data: { added: number; merged: number } };
    alert(`Added: ${data.data.added}, merged: ${data.data.merged}`);
    onDone();
    onClose();
  }

  const areaCls =
    "w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors";

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
            <p className="text-xs text-gray-400">MAL XML</p>
            <textarea rows={4} value={malContent} onChange={(e) => setMalContent(e.target.value)} placeholder="Paste MAL export XML here..." className={areaCls} />
            <button onClick={() => void runImport("mal")} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              Import MAL
            </button>
          </div>

          <div className="h-px bg-gray-800" />

          <div className="space-y-2">
            <p className="text-xs text-gray-400">AniList JSON</p>
            <textarea rows={4} value={aniContent} onChange={(e) => setAniContent(e.target.value)} placeholder="Paste AniList export JSON here..." className={areaCls} />
            <button onClick={() => void runImport("anilist")} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              Import AniList
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [items, setItems] = useState<Series[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [flagFilter, setFlagFilter] = useState<"none" | "reread" | "novel" | "follow">("none");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
    const result = await fetchSeriesList(query, statusFilter, flagFilter);
    setItems(result.items);
    setStatusCounts(result.statusCounts);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await fetchSeriesList(query, statusFilter, flagFilter);
      if (!cancelled) {
        setItems(result.items);
        setStatusCounts(result.statusCounts);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, statusFilter, flagFilter]);

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
    if (!confirm("Delete this series?")) return;
    await fetch(`/api/series/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function triggerBackup() {
    await fetch("/api/backups", { method: "POST" });
    alert("Backup created.");
  }

  async function exportMal() {
    const res = await fetch("/api/export/mal");
    const text = await res.text();
    await navigator.clipboard.writeText(text).catch(() => undefined);
    alert("MAL XML exported and copied to clipboard.");
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
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-medium sm:text-4xl">My Library</h1>
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
            <button onClick={() => void triggerBackup()} className={outlineBtn}>
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

        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-gray-800 bg-gray-900/50 p-1 backdrop-blur">
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

        {loading ? (
          <div className="flex justify-center py-20 text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <BookOpen className="mb-3 h-10 w-10" />
            <p>No series found for this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <MangaCard
                key={item.id}
                item={item}
                onChapter={(id, delta) => void changeChapter(id, delta)}
                onDelete={(id) => void deleteOne(id)}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddSeriesModal onClose={() => setShowAdd(false)} onAdded={() => void refresh()} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => void refresh()} />}
    </div>
  );
}
