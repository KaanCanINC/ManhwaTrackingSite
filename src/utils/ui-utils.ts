import type {
  MetadataSourceSite,
  PreferredSourceType,
  RereadSession,
  SeriesSource,
  SeriesStatus,
} from "@/lib/types";

export type { RereadSession };

export type RereadSessionForm = {
  startDate: string;
  finishDate: string;
};

export const STATUS_OPTIONS: Array<{ value: SeriesStatus; label: string; bg: string }> = [
  { value: "reading", label: "Reading", bg: "bg-blue-500" },
  { value: "plan_to_read", label: "Plan to Read", bg: "bg-gray-500" },
  { value: "completed", label: "Completed", bg: "bg-green-500" },
  { value: "up_to_date", label: "Up to Date", bg: "bg-green-500" },
  { value: "dropped", label: "Dropped", bg: "bg-red-500" },
];

export const RATING_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1 (Appalling)" },
  { value: 2, label: "2 (Horrible)" },
  { value: 3, label: "3 (Very Bad)" },
  { value: 4, label: "4 (Bad)" },
  { value: 5, label: "5 (Average)" },
  { value: 6, label: "6 (Fine)" },
  { value: 7, label: "7 (Good)" },
  { value: 8, label: "8 (Very Good)" },
  { value: 9, label: "9 (Great)" },
  { value: 10, label: "10 (Masterpiece)" },
];

export function clampInt(v: number): number {
  return Math.max(0, Number.isFinite(v) ? Math.floor(v) : 0);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 40) % 360;
  return `linear-gradient(145deg, hsl(${hueA} 60% 36%), hsl(${hueB} 65% 22%))`;
}

export function normalizeRereadSessions(sessions: RereadSessionForm[]): RereadSession[] {
  return sessions.map((session) => ({
    startDate: session.startDate || null,
    finishDate: session.finishDate || null,
  }));
}

export function ensureSessionCount(count: number, current: RereadSessionForm[]): RereadSessionForm[] {
  const target = clampInt(count);
  if (target <= 0) {
    return [];
  }
  const next = [...current];
  while (next.length < target) {
    next.push({ startDate: "", finishDate: "" });
  }
  return next.slice(0, target);
}

export function formatStatus(status: SeriesStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function statusBg(status: SeriesStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.bg ?? "bg-gray-500";
}

export function getPreferredSource(
  sources: SeriesSource[],
  preferredSourceType: PreferredSourceType | null,
  metadataSource?: {
    url: string | null;
    site: MetadataSourceSite | null;
    canonicalId: string | null;
  },
): SeriesSource | null {
  if (preferredSourceType) {
    const match =
      preferredSourceType === "MAL"
        ? metadataSource?.site === "myanimelist" && metadataSource.url
          ? {
              id: "metadata-mal",
              seriesId: "metadata",
              type: "EN" as const,
              url: metadataSource.url,
              site: "myanimelist",
              canonicalId: metadataSource.canonicalId,
              scrapedAt: null,
              scraperName: "metadata-source",
              lastError: null,
              meta: null,
            }
          : null
        : preferredSourceType === "ANILIST"
          ? metadataSource?.site === "anilist" && metadataSource.url
            ? {
                id: "metadata-anilist",
                seriesId: "metadata",
                type: "EN" as const,
                url: metadataSource.url,
                site: "anilist",
                canonicalId: metadataSource.canonicalId,
                scrapedAt: null,
                scraperName: "metadata-source",
                lastError: null,
                meta: null,
              }
            : null
          : sources.find((source) => source.type === preferredSourceType);
    if (match) return match;
  }
  return sources.find((source) => source.type === "TR") || sources.find((source) => source.type === "EN") || null;
}

type ParsedSourceMeta = {
  tags: string[];
  alternativeTitles: string[];
};

export function parseSourceMeta(source: SeriesSource | null): ParsedSourceMeta {
  if (!source?.meta || typeof source.meta !== "object") {
    return { tags: [], alternativeTitles: [] };
  }

  const tagsRaw = source.meta.tags;
  const alternativeTitlesRaw = source.meta.alternativeTitles;

  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

  const alternativeTitles = Array.isArray(alternativeTitlesRaw)
    ? alternativeTitlesRaw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return { tags, alternativeTitles };
}
