import { XMLParser } from "fast-xml-parser";
import type { PreferredSourceType, SeriesContentType, SeriesStatus } from "@/lib/types";

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

type MalUserListItem = {
  manga_id?: number;
  manga_title?: string;
  manga_num_chapters?: number;
  manga_url?: string;
  score?: number;
  status?: number | string;
  num_read_chapters?: number;
  start_date_string?: string | null;
  finish_date_string?: string | null;
  notes?: string;
};

function toStatusFromMalList(raw: number | string | undefined): SeriesStatus {
  const normalized = Number(raw);
  switch (normalized) {
    case 1:
      return "reading";
    case 2:
      return "completed";
    case 3:
      return "up_to_date"; // on-hold
    case 4:
      return "dropped";
    case 6:
      return "plan_to_read";
    default:
      return "plan_to_read";
  }
}

function toIsoDateFromMalList(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const match = cleaned.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year2 = Number(match[3]);

  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year2)) {
    return null;
  }

  if (month <= 0 || month > 12 || day <= 0 || day > 31) {
    return null;
  }

  const year = year2 >= 70 ? 1900 + year2 : 2000 + year2;
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

  return Number.isNaN(Date.parse(iso)) ? null : iso;
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
  contentType?: SeriesContentType | null;
  preferredSourceType?: PreferredSourceType | null;
  coverImageBlob?: Uint8Array | null;
  coverImageMimeType?: string | null;
  coverImageFetchedAt?: string | null;
  metadataFetchedAt?: string | null;
  metadataSourceUrl?: string | null;
  metadataSourceSite?: "myanimelist" | "anilist" | null;
  metadataSourceCanonicalId?: string | null;
  metadataSourceUpdatedAt?: string | null;
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

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  uuml: "ü",
  Uuml: "Ü",
  ouml: "ö",
  Ouml: "Ö",
  ccedil: "ç",
  Ccedil: "Ç",
  scedil: "ş",
  Scedil: "Ş",
  gbreve: "ğ",
  Gbreve: "Ğ",
  idot: "İ",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_full, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _full;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _full;
    }
    return ENTITY_MAP[entity] ?? _full;
  });
}

function toLooseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => toLooseText(item)).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const chunks: string[] = [];
    for (const [key, child] of Object.entries(record)) {
      if (key.toLowerCase() === "br") {
        chunks.push("\n");
        continue;
      }
      chunks.push(toLooseText(child));
    }
    return chunks.join("");
  }
  return String(value);
}

function normalizeImportedNotes(value: unknown): string {
  const decoded = decodeHtmlEntities(toLooseText(value));
  return decoded
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
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
        personalNotes: normalizeImportedNotes(item.my_comments),
        status: toStatus(item.my_status),
        reread: false,
        novelToRead: false,
        followUpdates: true,
        preferredSourceType: "MAL",
        coverImageBlob: null,
        coverImageMimeType: null,
        coverImageFetchedAt: null,
        metadataFetchedAt: null,
        metadataSourceUrl: null,
        metadataSourceSite: null,
        metadataSourceCanonicalId: null,
        metadataSourceUpdatedAt: null,
        sources: [],
      } satisfies ImportSeriesInput;
    });
}

async function fetchMalUserListPage(nickname: string, page: number): Promise<{
  items: MalUserListItem[];
  hasNext: boolean;
}> {
  const pageSize = 300;
  const offset = (page - 1) * pageSize;
  const url = new URL(`https://myanimelist.net/mangalist/${encodeURIComponent(nickname)}/load.json`);
  url.searchParams.set("status", "7");
  url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "manhwa-tracking-site/1.0 (+self-hosted)",
    },
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).toLowerCase();
    if (res.status === 400 || res.status === 404) {
      throw new Error("MAL user not found or list is private");
    }
    if (res.status === 429 || body.includes("too many")) {
      throw new Error("MAL rate limited, try again later");
    }
    throw new Error(`MAL nickname fetch failed (${res.status})`);
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error("MAL response format changed");
  }

  const items = json as MalUserListItem[];

  return {
    items,
    hasNext: items.length >= pageSize,
  };
}

export async function fetchMalImportByNickname(nickname: string): Promise<ImportSeriesInput[]> {
  const allItems: MalUserListItem[] = [];
  const maxPages = 30;

  for (let page = 1; page <= maxPages; page += 1) {
    const { items, hasNext } = await fetchMalUserListPage(nickname, page);
    allItems.push(...items);

    if (!hasNext || items.length === 0) {
      break;
    }

    // Gentle pacing for provider friendliness.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return allItems
    .filter((item) => item.manga_title?.trim())
    .map((item) => {
      const score = Number(item.score || 0);
      const rawUrl = String(item.manga_url || "").trim();
      const absoluteUrl = rawUrl.startsWith("http")
        ? rawUrl
        : rawUrl.startsWith("/")
          ? `https://myanimelist.net${rawUrl}`
          : "";

      return {
        title: String(item.manga_title || "").trim(),
        totalChapters: toInt(String(item.manga_num_chapters ?? 0)),
        chaptersRead: toInt(String(item.num_read_chapters ?? 0)),
        startDate: toIsoDateFromMalList(item.start_date_string),
        finishDate: toIsoDateFromMalList(item.finish_date_string),
        rating: score > 0 ? Math.max(1, Math.min(10, Math.round(score))) : null,
        description: "",
        personalNotes: normalizeImportedNotes(item.notes),
        status: toStatusFromMalList(item.status),
        reread: false,
        novelToRead: false,
        followUpdates: true,
        preferredSourceType: "MAL",
        coverImageBlob: null,
        coverImageMimeType: null,
        coverImageFetchedAt: null,
        metadataFetchedAt: null,
        metadataSourceUrl: absoluteUrl || null,
        metadataSourceSite: absoluteUrl ? "myanimelist" : null,
        metadataSourceCanonicalId: item.manga_id ? String(item.manga_id) : null,
        metadataSourceUpdatedAt: new Date().toISOString(),
        sources: [],
      } satisfies ImportSeriesInput;
    })
    .filter((item) => item.title.length > 0);
}
