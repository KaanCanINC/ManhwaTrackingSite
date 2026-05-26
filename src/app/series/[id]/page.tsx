"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, RefreshCw, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PreferredSourceType, Series, SeriesSource, SeriesStatus as Status, SourceType } from "@/lib/types";
import {
  clampInt,
  coverGradient,
  ensureSessionCount,
  getPreferredSource,
  normalizeRereadSessions,
  parseSourceMeta,
  RATING_OPTIONS,
  type RereadSessionForm,
  STATUS_OPTIONS,
  todayStr,
} from "@/utils/ui-utils";

type FormState = {
  title: string;
  totalChapters: number;
  chaptersRead: number;
  status: Status;
  contentType: "MANHWA" | "MANHUA" | "MANGA" | null;
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
  metadataSourceUrl: string;
  preferredSourceType: PreferredSourceType | null;
  coverImageBase64: string | null;
  coverImageMimeType: string | null;
  coverImageFetchedAt: string | null;
};

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

function formFromSeries(series: Series): FormState {
  const trSrc = series.sources.find((source) => source.type === "TR");
  const enSrc = series.sources.find((source) => source.type === "EN");

  return {
    title: series.title,
    totalChapters: series.totalChapters,
    chaptersRead: series.chaptersRead,
    status: series.status,
    contentType: series.contentType,
    rating: series.rating ?? "",
    description: series.description ?? "",
    personalNotes: series.personalNotes,
    reread: series.reread,
    totalRereads: series.totalRereads ?? 0,
    rereadSessions: ensureSessionCount(
      series.totalRereads ?? 0,
      (series.rereadSessions ?? []).map((session) => ({
        startDate: session.startDate ?? "",
        finishDate: session.finishDate ?? "",
      })),
    ),
    novelToRead: series.novelToRead,
    followUpdates: series.followUpdates,
    startDate: series.startDate ?? "",
    finishDate: series.finishDate ?? "",
    trUrl: trSrc?.url ?? "",
    enUrl: enSrc?.url ?? "",
    metadataSourceUrl: series.metadataSourceUrl ?? "",
    preferredSourceType: series.preferredSourceType,
    coverImageBase64: null,
    coverImageMimeType: series.coverImageMimeType,
    coverImageFetchedAt: series.coverImageFetchedAt,
  };
}

function resolveSourcePayload(
  type: SourceType,
  url: string,
  originalSources: SeriesSource[],
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

export default function SeriesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [series, setSeries] = useState<Series | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [sourceMetaOverrides, setSourceMetaOverrides] =
    useState<Partial<Record<SourceType, SourceMetaOverride>>>({});
  const [scrapingSource, setScrapingSource] = useState<SourceType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reEnriching, setReEnriching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const progress = form
    ? (() => {
        const total = clampInt(form.totalChapters);
        const read = clampInt(form.chaptersRead);
        return total > 0 ? Math.round((read / total) * 100) : 0;
      })()
    : 0;

  const activePreferredSource = useMemo(() => {
    if (!series || !form) return null;

    const existing = getPreferredSource(
      series.sources,
      form.preferredSourceType ?? series.preferredSourceType,
      {
        url: form.metadataSourceUrl || series.metadataSourceUrl,
        site: series.metadataSourceSite,
        canonicalId: series.metadataSourceCanonicalId,
      },
    );
    if (!existing) return null;

    const override = sourceMetaOverrides[existing.type];
    return {
      ...existing,
      site: override?.site ?? existing.site,
      canonicalId: override?.canonicalId ?? existing.canonicalId,
      scrapedAt: override?.scrapedAt ?? existing.scrapedAt,
      scraperName: override?.scraperName ?? existing.scraperName,
      lastError: override?.lastError ?? existing.lastError,
      meta: override?.meta ?? existing.meta,
    };
  }, [form, series, sourceMetaOverrides]);

  const detectedMetadataSite = useMemo(() => {
    const raw = form?.metadataSourceUrl?.trim();
    if (!raw) return null;
    try {
      const host = new URL(raw).hostname.toLowerCase();
      if (host === "myanimelist.net" || host.endsWith(".myanimelist.net")) return "myanimelist";
      if (host === "anilist.co" || host.endsWith(".anilist.co")) return "anilist";
    } catch {
      return null;
    }
    return null;
  }, [form?.metadataSourceUrl]);

  const preferredMeta = parseSourceMeta(activePreferredSource);

  const coverSrc = useMemo(() => {
    if (!series || !form) return null;
    if (form.coverImageBase64) {
      const mime = form.coverImageMimeType || "image/jpeg";
      return `data:${mime};base64,${form.coverImageBase64}`;
    }
    if (series.hasCoverImage) {
      return `/api/series/${series.id}/cover?u=${encodeURIComponent(series.updatedAt)}`;
    }
    return null;
  }, [form, series]);

  useEffect(() => {
    void fetch(`/api/series/${params.id}`)
      .then((res) => res.json())
      .then((json: { data: Series }) => {
        setSeries(json.data);
        setForm(formFromSeries(json.data));
        setLoading(false);
      })
      .catch(() => {
        setError("Series not found.");
        setLoading(false);
      });
  }, [params.id]);

  function f<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateRereadCount(nextCount: number) {
    const count = clampInt(nextCount);
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totalRereads: count,
        reread: count > 0 ? true : prev.reread,
        rereadSessions: ensureSessionCount(count, prev.rereadSessions),
      };
    });
  }

  function updateRereadSession(index: number, key: keyof RereadSessionForm, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const next = [...prev.rereadSessions];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [key]: value };
      return { ...prev, rereadSessions: next };
    });
  }

  async function scrapeFromSource(sourceType: SourceType) {
    if (!form) return;
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
        if (!prev) return prev;

        const nextTotalChapters =
          prev.totalChapters > 0
            ? prev.totalChapters
            : clampInt(scraped.metadata.totalChapters ?? 0);

        return {
          ...prev,
          title: scraped.metadata.title || prev.title,
          totalChapters: nextTotalChapters,
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

  async function handleSave() {
    if (!series || !form) return;

    setSaving(true);

    const trSource = resolveSourcePayload("TR", form.trUrl, series.sources, sourceMetaOverrides);
    const enSource = resolveSourcePayload("EN", form.enUrl, series.sources, sourceMetaOverrides);
    const sources = [trSource, enSource].filter(Boolean);

    const selectedPreferred = form.preferredSourceType;
    const metadataSourceUrl = form.metadataSourceUrl.trim();
    if (metadataSourceUrl && !detectedMetadataSite) {
      setError("Metadata Source must be a valid AniList or MyAnimeList URL.");
      setSaving(false);
      return;
    }

    const preferredExists = selectedPreferred
      ? selectedPreferred === "MAL"
        ? detectedMetadataSite === "myanimelist"
        : selectedPreferred === "ANILIST"
          ? detectedMetadataSite === "anilist"
          : sources.some((source) => source?.type === selectedPreferred)
      : false;

    try {
      const res = await fetch(`/api/series/${series.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          totalChapters: clampInt(form.totalChapters),
          chaptersRead: clampInt(form.chaptersRead),
          status: form.status,
          contentType: form.contentType,
          rating: form.rating === "" ? null : Number(form.rating),
          description: form.description,
          personalNotes: form.personalNotes,
          reread: form.reread || form.totalRereads > 0,
          totalRereads: clampInt(form.totalRereads),
          rereadSessions: normalizeRereadSessions(form.rereadSessions),
          novelToRead: form.novelToRead,
          followUpdates: form.followUpdates,
          preferredSourceType: preferredExists ? selectedPreferred : null,
          startDate: form.startDate || null,
          finishDate: form.finishDate || null,
          metadataSourceUrl: metadataSourceUrl || null,
          metadataSourceSite: detectedMetadataSite,
          metadataSourceUpdatedAt: metadataSourceUrl ? new Date().toISOString() : null,
          sources,
          coverImageBase64: form.coverImageBase64,
          coverImageMimeType: form.coverImageMimeType,
          coverImageFetchedAt: form.coverImageFetchedAt,
          metadataFetchedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as unknown;
        setError(`Save failed: ${JSON.stringify(err)}`);
        return;
      }

      router.push("/");
    } catch {
      setError("Network error - changes not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!series) return;
    await fetch(`/api/series/${series.id}`, { method: "DELETE" });
    router.push("/");
  }

  async function handleReEnrichImported() {
    if (!series) return;

    setReEnriching(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/series/${series.id}/re-enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "auto" }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Re-fetch failed");
      }

      setFeedback("Metadata re-fetch queued. It will update in background.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-fetch failed");
    } finally {
      setReEnriching(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors";
  const labelCls = "mb-1.5 block text-xs text-gray-400";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-400">
        Loading...
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-400">
        <p>{error}</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300">
          Back to Library
        </Link>
      </div>
    );
  }

  if (!series || !form) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>

        <div className="flex items-start gap-4 sm:gap-6 md:gap-8">
          <div className="w-28 shrink-0 pt-1 sm:w-33 md:w-37">
            <div className="sticky top-6 overflow-hidden rounded-xl shadow-xl" style={{ background: coverGradient(series.title) }}>
              <div className="relative aspect-2/3">
                {coverSrc ? (
                  <Image
                    src={coverSrc}
                    alt={`${form.title} cover`}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl font-bold tracking-widest text-white/20 select-none">
                    {form.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <h1 className="text-3xl font-medium leading-tight">{form.title}</h1>
              {preferredMeta.alternativeTitles.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  Alternative: {preferredMeta.alternativeTitles.slice(0, 5).join(" | ")}
                </p>
              )}
              {preferredMeta.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {preferredMeta.tags.slice(0, 10).map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-200">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-300">
                <div className="flex items-center gap-1 text-yellow-400">
                  <Star className="h-4 w-4 fill-current" />
                  <span>{form.rating === "" ? "Not rated" : `${form.rating} / 10`}</span>
                </div>
                {form.contentType && (
                  <span className="rounded-full border border-blue-500/50 bg-blue-900/50 px-2 py-0.5 text-xs font-medium text-blue-200">
                    {form.contentType === "MANHWA" ? "Manhwa" : form.contentType === "MANHUA" ? "Manhua" : "Manga"}
                  </span>
                )}
                <div className="flex items-center gap-1 text-gray-300">
                  <BookOpen className="h-4 w-4" />
                  <span>
                    {clampInt(form.chaptersRead)} / {clampInt(form.totalChapters)} ({progress}%)
                  </span>
                </div>
                {form.totalRereads > 0 && <span className="text-cyan-300">Re-reads: {form.totalRereads}</span>}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-300">
                {form.description?.trim() || "No synopsis added yet."}
              </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-6">
              <h2 className="text-lg font-medium text-white">Tracking Details</h2>
              {error && <p className="text-sm text-red-400">{error}</p>}
              {feedback && <p className="text-sm text-blue-300">{feedback}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Title</label>
                  <input value={form.title} onChange={(e) => f("title", e.target.value)} className={inputCls} />
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
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => f("status", e.target.value as Status)} className={inputCls}>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
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
                  <label className={labelCls}>Series Type</label>
                  <select
                    value={form.contentType || ""}
                    onChange={(e) => f("contentType", (e.target.value || null) as FormState["contentType"])}
                    className={inputCls}
                  >
                    <option value="">Not set</option>
                    <option value="MANHWA">Manhwa</option>
                    <option value="MANHUA">Manhua</option>
                    <option value="MANGA">Manga</option>
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
                    {detectedMetadataSite === "myanimelist" && <option value="MAL">MyAnimeList</option>}
                    {detectedMetadataSite === "anilist" && <option value="ANILIST">AniList</option>}
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
                      className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white"
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
                      className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white"
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
              </div>

              {form.totalRereads > 0 && (
                <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                  <p className="mb-3 text-xs font-medium text-cyan-300">Re-read Date Ranges (optional)</p>
                  <div className="space-y-3">
                    {form.rereadSessions.map((session, index) => (
                      <div key={`session-${index}`} className="grid gap-2 sm:grid-cols-[1fr,1fr,auto,auto]">
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

              <div>
                <label className={labelCls}>Personal Notes</label>
                <textarea
                  rows={4}
                  value={form.personalNotes}
                  onChange={(e) => f("personalNotes", e.target.value)}
                  placeholder="Your custom notes..."
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <div className="mb-4 h-px bg-gray-800" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className={labelCls}>Turkish Source</label>
                    <input
                      value={form.trUrl}
                      onChange={(e) => f("trUrl", e.target.value)}
                      placeholder="https://..."
                      className={inputCls}
                    />
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
                    <input
                      value={form.enUrl}
                      onChange={(e) => f("enUrl", e.target.value)}
                      placeholder="https://..."
                      className={inputCls}
                    />
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
                </div>

                <div className="mt-3 space-y-2">
                  <label className={labelCls}>Metadata Source</label>
                  <input
                    value={form.metadataSourceUrl}
                    onChange={(e) => f("metadataSourceUrl", e.target.value)}
                    placeholder="https://myanimelist.net/manga/... or https://anilist.co/manga/..."
                    className={inputCls}
                  />
                  {form.metadataSourceUrl.trim() && !detectedMetadataSite && (
                    <p className="text-xs text-red-400">Only AniList and MyAnimeList URLs are supported.</p>
                  )}
                  {detectedMetadataSite && (
                    <p className="text-xs text-blue-300">
                      Detected metadata provider: {detectedMetadataSite === "myanimelist" ? "MyAnimeList" : "AniList"}
                    </p>
                  )}
                </div>

                {(detectedMetadataSite === "myanimelist" || detectedMetadataSite === "anilist") && (
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={reEnriching}
                      onClick={() => void handleReEnrichImported()}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${reEnriching ? "animate-spin" : ""}`} />
                      {reEnriching ? "Queueing..." : "Re-fetch Imported Metadata"}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-4 h-px bg-gray-800" />
                <div className="flex flex-wrap gap-5">
                  {[
                    { key: "reread" as const, label: "Re-Readable" },
                    { key: "novelToRead" as const, label: "Novel to Read" },
                    { key: "followUpdates" as const, label: "Follow Updates" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={(e) => f(key, e.target.checked)}
                        className="accent-blue-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-400 hover:border-red-600 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-sm text-gray-200">Delete this series?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  void handleDelete();
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
