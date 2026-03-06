import { XMLParser } from "fast-xml-parser";
import type { PreferredSourceType, SeriesStatus } from "@/lib/types";

interface MalAnime {
  series_title?: string;
  series_episodes?: string;
  my_watched_episodes?: string;
  manga_title?: string;
  manga_chapters?: string;
  my_read_chapters?: string;
  my_start_date?: string;
  my_finish_date?: string;
  my_score?: string;
  my_status?: string;
  my_comments?: string;
}

export interface ImportSeriesInput {
  title: string;
  totalChapters: number;
  chaptersRead: number;
  startDate: string | null;
  finishDate: string | null;
  rating: number | null;
  description: string;
  personalNotes: string;
  status: SeriesStatus;
  reread: boolean;
  novelToRead: boolean;
  followUpdates: boolean;
  preferredSourceType?: PreferredSourceType | null;
  coverImageBlob?: Uint8Array | null;
  coverImageMimeType?: string | null;
  coverImageFetchedAt?: string | null;
  metadataFetchedAt?: string | null;
  sources: Array<{
    type: "TR" | "EN";
    url: string;
    site?: string | null;
    canonicalId?: string | null;
    scrapedAt?: string | null;
    scraperName?: string | null;
    lastError?: { message: string; timestamp: string } | null;
    meta?: Record<string, unknown> | null;
  }>;
}

function toStatus(status?: string): SeriesStatus {
  const normalized = (status || "").toLowerCase().replaceAll("_", " ").trim();
  switch (normalized) {
    case "completed":
      return "completed";
    case "dropped":
      return "dropped";
    case "on hold":
      return "up_to_date";
    case "plan to read":
    case "plantoread":
      return "plan_to_read";
    case "watching":
    case "reading":
      return "reading";
    default:
      return "plan_to_read";
  }
}

function toInt(raw: string | undefined): number {
  const parsed = Number(raw || 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function toIsoDate(value?: string): string | null {
  if (!value || value === "0000-00-00") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function parseMalExport(content: string): ImportSeriesInput[] {
  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(content) as {
    myanimelist?: { anime?: MalAnime | MalAnime[]; manga?: MalAnime | MalAnime[] };
  };

  const raw = parsed.myanimelist?.manga || parsed.myanimelist?.anime || [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .filter((item) => (item.manga_title || item.series_title || "").trim())
    .map((item) => {
      const score = Number(item.my_score || 0);
      return {
        title: String(item.manga_title || item.series_title || "").trim(),
        totalChapters: toInt(item.manga_chapters || item.series_episodes),
        chaptersRead: toInt(item.my_read_chapters || item.my_watched_episodes),
        startDate: toIsoDate(item.my_start_date),
        finishDate: toIsoDate(item.my_finish_date),
        rating: score > 0 ? score : null,
        description: "",
        personalNotes: item.my_comments || "",
        status: toStatus(item.my_status),
        reread: false,
        novelToRead: false,
        followUpdates: true,
        preferredSourceType: "MAL",
        coverImageBlob: null,
        coverImageMimeType: null,
        coverImageFetchedAt: null,
        metadataFetchedAt: null,
        sources: [],
      } satisfies ImportSeriesInput;
    });
}
