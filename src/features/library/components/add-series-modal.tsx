import Image from "next/image";
import { RefreshCw, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import type { Notice } from "@/lib/contracts";
import type { PreferredSourceType, Series, SourceType } from "@/lib/types";
import {
  clampInt,
  coverGradient,
  ensureSessionCount,
  normalizeRereadSessions,
  RATING_OPTIONS,
  STATUS_OPTIONS,
  todayStr,
  type RereadSessionForm,
} from "@/utils/ui-utils";
import { EMPTY_FORM, type FormState, type ScrapeWebsiteResponse, type SourceMetaOverride } from "@/features/library/types";

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

type Props = {
  onClose: () => void;
  onAdded: () => void;
  onNotify: (notice: Notice) => void;
};

export function AddSeriesModal({ onClose, onAdded, onNotify }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scrapingSource, setScrapingSource] = useState<SourceType | null>(null);
  const [sourceMetaOverrides, setSourceMetaOverrides] =
    useState<Partial<Record<SourceType, SourceMetaOverride>>>({});
  const [error, setError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

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
          : form.preferredSourceType === "CUSTOM"
            ? sources.length > 0
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
        contentType: form.contentType,
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
  const coverPreviewSrc =
    form.coverImageBase64 && form.coverImageMimeType
      ? `data:${form.coverImageMimeType};base64,${form.coverImageBase64}`
      : null;

  async function setCustomCover(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Custom cover must be an image file.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Failed to read image file."));
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });

    const base64 = dataUrl.split(",")[1] || null;
    if (!base64) {
      setError("Failed to parse custom cover image.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      coverImageBase64: base64,
      coverImageMimeType: file.type,
      coverImageFetchedAt: new Date().toISOString(),
    }));
    setError(null);
  }

  function clearCustomCover() {
    setForm((prev) => ({
      ...prev,
      coverImageBase64: null,
      coverImageMimeType: null,
      coverImageFetchedAt: null,
    }));
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  }

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
            <label className={labelCls}>Cover Preview</label>
            <div className="flex flex-wrap items-start gap-4 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
              <div className="relative h-40 w-28 overflow-hidden rounded-md border border-gray-700" style={{ background: coverGradient(form.title || "Cover") }}>
                {coverPreviewSrc ? (
                  <Image
                    src={coverPreviewSrc}
                    alt="Selected cover preview"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-xs text-gray-300">
                    No cover
                  </div>
                )}
              </div>

              <div className="flex min-w-56 flex-1 flex-col gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void setCustomCover(e.target.files?.[0] ?? null)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-blue-600 file:px-2 file:py-1 file:text-xs file:text-white"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-blue-500 hover:text-white"
                  >
                    Add Custom Cover
                  </button>
                  <button
                    type="button"
                    onClick={clearCustomCover}
                    disabled={!coverPreviewSrc}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                  >
                    Clear Cover
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">Source cover is shown after metadata fetch; custom upload overrides it.</p>
              </div>
            </div>
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
            <select value={form.status} onChange={(e) => f("status", e.target.value as FormState["status"])} className={inputCls}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
              <option value="CUSTOM">Custom</option>
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
