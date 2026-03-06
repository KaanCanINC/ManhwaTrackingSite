"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Series, SeriesStatus as Status, SourceType } from "@/lib/types";
import {
  clampInt,
  coverGradient,
  ensureSessionCount,
  normalizeRereadSessions,
  RATING_OPTIONS,
  type RereadSessionForm,
  STATUS_OPTIONS,
  todayStr,
} from "@/lib/ui-utils";

type FormState = {
  totalChapters: number;
  chaptersRead: number;
  status: Status;
  rating: number | "";
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
};

function formFromSeries(series: Series): FormState {
  const trSrc = series.sources.find((source) => source.type === "TR");
  const enSrc = series.sources.find((source) => source.type === "EN");

  return {
    totalChapters: series.totalChapters,
    chaptersRead: series.chaptersRead,
    status: series.status,
    rating: series.rating ?? "",
    personalNotes: series.personalNotes,
    reread: series.reread,
    totalRereads: series.totalRereads ?? 0,
    rereadSessions: ensureSessionCount(
      series.totalRereads ?? 0,
      (series.rereadSessions ?? []).map((session) => ({
        startDate: session.startDate ?? "",
        finishDate: session.finishDate ?? "",
      }))
    ),
    novelToRead: series.novelToRead,
    followUpdates: series.followUpdates,
    startDate: series.startDate ?? "",
    finishDate: series.finishDate ?? "",
    trUrl: trSrc?.url ?? "",
    enUrl: enSrc?.url ?? "",
  };
}

export default function SeriesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [series, setSeries] = useState<Series | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = form
    ? (() => {
        const total = clampInt(form.totalChapters);
        const read = clampInt(form.chaptersRead);
        return total > 0 ? Math.round((read / total) * 100) : 0;
      })()
    : 0;

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

  async function handleSave() {
    if (!series || !form) return;

    setSaving(true);
    const sources: Array<{ type: SourceType; url: string }> = [];
    if (form.trUrl.trim()) sources.push({ type: "TR", url: form.trUrl.trim() });
    if (form.enUrl.trim()) sources.push({ type: "EN", url: form.enUrl.trim() });

    try {
      const res = await fetch(`/api/series/${series.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalChapters: clampInt(form.totalChapters),
          chaptersRead: clampInt(form.chaptersRead),
          status: form.status,
          rating: form.rating === "" ? null : Number(form.rating),
          personalNotes: form.personalNotes,
          reread: form.reread || form.totalRereads > 0,
          totalRereads: clampInt(form.totalRereads),
          rereadSessions: normalizeRereadSessions(form.rereadSessions),
          novelToRead: form.novelToRead,
          followUpdates: form.followUpdates,
          startDate: form.startDate || null,
          finishDate: form.finishDate || null,
          sources,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as unknown;
        setError(`Save failed: ${JSON.stringify(err)}`);
        return;
      }

      router.push("/");
    } catch {
      setError("Network error — changes not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!series || !confirm(`Delete "${series.title}"?`)) return;
    await fetch(`/api/series/${series.id}`, { method: "DELETE" });
    router.push("/");
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

  if (error || !series || !form) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-400">
        <p>{error ?? "Something went wrong."}</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300">
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>

        <div className="flex items-start gap-4 sm:gap-6 md:gap-8">
          <div className="w-28 shrink-0 pt-1 sm:w-33 md:w-37">
            <div className="sticky top-6 overflow-hidden rounded-xl shadow-xl" style={{ background: coverGradient(series.title) }}>
              <div className="aspect-2/3 flex items-center justify-center text-3xl font-bold tracking-widest text-white/20 select-none">
                {series.title.slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
              <h1 className="text-3xl font-medium leading-tight">{series.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-300">
                <div className="flex items-center gap-1 text-yellow-400">
                  <Star className="h-4 w-4 fill-current" />
                  <span>{form.rating === "" ? "Not rated" : `${form.rating} / 10`}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-300">
                  <BookOpen className="h-4 w-4" />
                  <span>
                    {clampInt(form.chaptersRead)} / {clampInt(form.totalChapters)} ({progress}%)
                  </span>
                </div>
                {form.totalRereads > 0 && <span className="text-cyan-300">Re-reads: {form.totalRereads}</span>}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-300">
                {form.personalNotes?.trim() || "No synopsis/notes added yet."}
              </p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-6">
              <h2 className="text-lg font-medium text-white">Tracking Details</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Chapters Read</label>
                  <input type="number" min={0} value={form.chaptersRead} onChange={(e) => f("chaptersRead", clampInt(Number(e.target.value)))} className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>Total Chapters</label>
                  <input type="number" min={0} value={form.totalChapters} onChange={(e) => f("totalChapters", clampInt(Number(e.target.value)))} className={inputCls} />
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
                  <select value={form.rating === "" ? "" : String(form.rating)} onChange={(e) => f("rating", e.target.value ? Number(e.target.value) : "")} className={inputCls}>
                    <option value="">Not rated</option>
                    {RATING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Start Date</label>
                  <div className="flex gap-2">
                    <input type="date" value={form.startDate} onChange={(e) => f("startDate", e.target.value)} className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                    <button type="button" onClick={() => f("startDate", todayStr())} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white">Today</button>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Finish Date</label>
                  <div className="flex gap-2">
                    <input type="date" value={form.finishDate} onChange={(e) => f("finishDate", e.target.value)} className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors" />
                    <button type="button" onClick={() => f("finishDate", todayStr())} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white">Today</button>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Total Times Re-read</label>
                  <input type="number" min={0} step={1} value={form.totalRereads} onChange={(e) => updateRereadCount(Number(e.target.value))} className={inputCls} />
                </div>
              </div>

              {form.totalRereads > 0 && (
                <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                  <p className="mb-3 text-xs font-medium text-cyan-300">Re-read Date Ranges (optional)</p>
                  <div className="space-y-3">
                    {form.rereadSessions.map((session, index) => (
                      <div key={`session-${index}`} className="grid gap-2 sm:grid-cols-[1fr,1fr,auto,auto]">
                        <input type="date" value={session.startDate} onChange={(e) => updateRereadSession(index, "startDate", e.target.value)} className={inputCls} />
                        <input type="date" value={session.finishDate} onChange={(e) => updateRereadSession(index, "finishDate", e.target.value)} className={inputCls} />
                        <button type="button" onClick={() => updateRereadSession(index, "startDate", todayStr())} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white">Start Today</button>
                        <button type="button" onClick={() => updateRereadSession(index, "finishDate", todayStr())} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:text-white">Finish Today</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Synopsis / Notes</label>
                <textarea
                  rows={4}
                  value={form.personalNotes}
                  onChange={(e) => f("personalNotes", e.target.value)}
                  placeholder="Add synopsis or personal notes..."
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <div className="mb-4 h-px bg-gray-800" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Turkish Source</label>
                    <input value={form.trUrl} onChange={(e) => f("trUrl", e.target.value)} placeholder="https://..." className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>English Source</label>
                    <input value={form.enUrl} onChange={(e) => f("enUrl", e.target.value)} placeholder="https://..." className={inputCls} />
                  </div>
                </div>
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
                      <input type="checkbox" checked={form[key]} onChange={(e) => f(key, e.target.checked)} className="accent-blue-500" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <button onClick={() => void handleDelete()} className="flex items-center gap-2 rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-400 hover:border-red-600 hover:text-red-300 transition-colors">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
                <button onClick={() => void handleSave()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
