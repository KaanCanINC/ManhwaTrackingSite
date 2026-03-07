import { ENRICH_MIN_CONFIDENCE, sleep } from "./config";

export type ImportSource = "mal" | "anilist";

export type Enrichment = {
  title: string;
  description: string;
  totalChapters: number | null;
  sourceUrl: string;
  coverImageUrl: string | null;
  sourceSite: "myanimelist" | "anilist";
  canonicalId: string | null;
  contentCategory: "safe" | "ecchi" | "hentai";
  confidence: number;
  matchReason: string;
};

type RetryableHttpError = {
  status: number;
  retryAfterMs: number;
};

const ENRICH_TIMEOUT_MS = Number(process.env.ENRICH_TIMEOUT_MS || 10000);
const ENRICH_DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 600);
const ENRICH_MAX_RETRIES = Number(process.env.ENRICH_MAX_RETRIES || 3);
const ENRICH_CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY || 1);

function jitter(baseMs: number): number {
  const variance = Math.floor(baseMs * 0.25);
  const min = Math.max(0, baseMs - variance);
  const max = baseMs + variance;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return 0;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.floor(asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (Number.isNaN(asDate)) return 0;
  return Math.max(0, asDate - Date.now());
}

function toRetryableHttpError(status: number, retryAfterHeader: string | null): RetryableHttpError | null {
  if (status === 429 || status === 503 || status === 504) {
    return {
      status,
      retryAfterMs: parseRetryAfterMs(retryAfterHeader),
    };
  }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T | null> {
  for (let attempt = 1; attempt <= ENRICH_MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        "retryAfterMs" in error
          ? (error as RetryableHttpError)
          : null;

      const shouldRetry = isAbort || retryable !== null;
      const isLast = attempt >= ENRICH_MAX_RETRIES;
      if (!shouldRetry || isLast) {
        return null;
      }

      const retryAfterMs = retryable?.retryAfterMs ?? 0;
      const backoffMs = Math.min(10_000, 400 * 2 ** (attempt - 1));
      const waitMs = Math.max(retryAfterMs, backoffMs);

      console.warn(`[import-enrichment:${label}] retrying attempt=${attempt + 1} waitMs=${waitMs}`);
      await sleep(waitMs + jitter(150));
    }
  }

  return null;
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const aSet = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const bSet = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? intersection / union : 0;
}

function chapterSimilarity(expected: number | null, candidate: number | null): number {
  if (!expected || expected <= 0 || !candidate || candidate <= 0) return 0.6;
  const diff = Math.abs(expected - candidate);
  const max = Math.max(expected, candidate);
  const ratio = max > 0 ? diff / max : 1;
  return Math.max(0, 1 - ratio * 1.4);
}

function computeConfidence(
  queryTitle: string,
  candidateTitle: string,
  expectedChapters: number | null,
  candidateChapters: number | null,
): { confidence: number; reason: string } {
  const titleScore = tokenSimilarity(queryTitle, candidateTitle);
  const chapterScore = chapterSimilarity(expectedChapters, candidateChapters);
  const confidence = titleScore * 0.78 + chapterScore * 0.22;
  return {
    confidence,
    reason: `title=${titleScore.toFixed(2)} chapters=${chapterScore.toFixed(2)}`,
  };
}

function pickBestEnrichment(
  queryTitle: string,
  expectedChapters: number | null,
  candidates: Array<Omit<Enrichment, "confidence" | "matchReason">>,
): Enrichment | null {
  if (candidates.length === 0) return null;

  let best: Enrichment | null = null;
  for (const candidate of candidates) {
    const score = computeConfidence(queryTitle, candidate.title, expectedChapters, candidate.totalChapters);
    const withScore: Enrichment = {
      ...candidate,
      confidence: score.confidence,
      matchReason: score.reason,
    };
    if (!best || withScore.confidence > best.confidence) {
      best = withScore;
    }
  }

  if (!best || best.confidence < ENRICH_MIN_CONFIDENCE) {
    return null;
  }
  return best;
}

async function fetchMalByTitle(title: string, expectedChapters: number | null): Promise<Enrichment | null> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", title);
  url.searchParams.set("limit", "5");

  const json = await withRetry("mal", async () => {
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const retryable = toRetryableHttpError(res.status, res.headers.get("retry-after"));
      if (retryable) throw retryable;
      return null;
    }

    return (await res.json()) as {
      data?: Array<{
        mal_id?: number;
        title?: string;
        chapters?: number | null;
        synopsis?: string | null;
        url?: string;
        genres?: Array<{ name?: string }>;
        explicit_genres?: Array<{ name?: string }>;
        images?: { jpg?: { image_url?: string }; webp?: { image_url?: string } };
      }>;
    };
  });

  if (!json) return null;

  const parsed = json as {
    data?: Array<{
      mal_id?: number;
      title?: string;
      chapters?: number | null;
      synopsis?: string | null;
      url?: string;
      genres?: Array<{ name?: string }>;
      explicit_genres?: Array<{ name?: string }>;
      images?: { jpg?: { image_url?: string }; webp?: { image_url?: string } };
    }>;
  };

  const candidates = (parsed.data ?? [])
    .filter((item) => item.title && item.url)
    .map((item) => {
      const genres = [...(item.genres ?? []), ...(item.explicit_genres ?? [])]
        .map((genre) => String(genre.name || "").toLowerCase())
        .filter(Boolean);
      const isHentai = genres.includes("hentai");
      const isEcchi = !isHentai && (genres.includes("ecchi") || genres.includes("erotica"));

      return {
        title: String(item.title),
        description: item.synopsis?.trim() || "",
        totalChapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : null,
        sourceUrl: String(item.url),
        coverImageUrl: item.images?.webp?.image_url || item.images?.jpg?.image_url || null,
        sourceSite: "myanimelist" as const,
        canonicalId: item.mal_id ? String(item.mal_id) : null,
        contentCategory: isHentai ? "hentai" as const : isEcchi ? "ecchi" as const : "safe" as const,
      };
    });

  return pickBestEnrichment(title, expectedChapters, candidates);
}

async function fetchAniListByTitle(title: string, expectedChapters: number | null): Promise<Enrichment | null> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: MANGA) {
          id
          siteUrl
          title {
            romaji
            english
            native
          }
          chapters
          description(asHtml: false)
          coverImage {
            large
          }
          isAdult
          genres
        }
      }
    }
  `;

  const json = await withRetry("anilist", async () => {
    const res = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables: { search: title } }),
    });

    if (!res.ok) {
      const retryable = toRetryableHttpError(res.status, res.headers.get("retry-after"));
      if (retryable) throw retryable;
      return null;
    }

    return (await res.json()) as {
      data?: {
        Page?: {
          media?: Array<{
            id?: number;
            siteUrl?: string;
            title?: { romaji?: string | null; english?: string | null; native?: string | null };
            chapters?: number | null;
            description?: string | null;
            coverImage?: { large?: string | null };
            isAdult?: boolean | null;
            genres?: string[] | null;
          }>;
        };
      };
    };
  });

  if (!json) return null;

  const parsed = json as {
    data?: {
      Page?: {
        media?: Array<{
          id?: number;
          siteUrl?: string;
          title?: { romaji?: string | null; english?: string | null; native?: string | null };
          chapters?: number | null;
          description?: string | null;
          coverImage?: { large?: string | null };
          isAdult?: boolean | null;
          genres?: string[] | null;
        }>;
      };
    };
  };

  const candidates = (parsed.data?.Page?.media ?? [])
    .filter((media) => Boolean(media.siteUrl))
    .map((media) => {
      const genres = (media.genres ?? []).map((genre) => String(genre).toLowerCase());
      const isHentai = genres.includes("hentai");
      const isEcchi = !isHentai && (genres.includes("ecchi") || Boolean(media.isAdult));
      const bestTitle = media.title?.english || media.title?.romaji || media.title?.native || title;

      return {
        title: bestTitle,
        description: stripHtml(media.description || ""),
        totalChapters: typeof media.chapters === "number" && media.chapters > 0 ? media.chapters : null,
        sourceUrl: String(media.siteUrl),
        coverImageUrl: media.coverImage?.large || null,
        sourceSite: "anilist" as const,
        canonicalId: media.id ? String(media.id) : null,
        contentCategory: isHentai ? "hentai" as const : isEcchi ? "ecchi" as const : "safe" as const,
      };
    });

  return pickBestEnrichment(title, expectedChapters, candidates);
}

async function fetchMalByCanonicalId(canonicalId: string): Promise<Enrichment | null> {
  const url = `https://api.jikan.moe/v4/manga/${encodeURIComponent(canonicalId)}`;
  const json = await withRetry("mal-id", async () => {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as {
      data?: {
        mal_id?: number;
        title?: string;
        chapters?: number | null;
        synopsis?: string | null;
        url?: string;
        genres?: Array<{ name?: string }>;
        explicit_genres?: Array<{ name?: string }>;
        images?: { jpg?: { image_url?: string }; webp?: { image_url?: string } };
      };
    };
  });
  const item = json?.data;
  if (!item?.title || !item.url) return null;
  const genres = [...(item.genres ?? []), ...(item.explicit_genres ?? [])]
    .map((genre) => String(genre.name || "").toLowerCase())
    .filter(Boolean);
  const isHentai = genres.includes("hentai");
  const isEcchi = !isHentai && (genres.includes("ecchi") || genres.includes("erotica"));
  return {
    title: item.title,
    description: item.synopsis?.trim() || "",
    totalChapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : null,
    sourceUrl: item.url,
    coverImageUrl: item.images?.webp?.image_url || item.images?.jpg?.image_url || null,
    sourceSite: "myanimelist",
    canonicalId: item.mal_id ? String(item.mal_id) : canonicalId,
    contentCategory: isHentai ? "hentai" : isEcchi ? "ecchi" : "safe",
    confidence: 1,
    matchReason: "canonical-id",
  };
}

async function fetchAniListByCanonicalId(canonicalId: string): Promise<Enrichment | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        siteUrl
        title { romaji english native }
        chapters
        description(asHtml: false)
        coverImage { large }
        isAdult
        genres
      }
    }
  `;

  const json = await withRetry("anilist-id", async () => {
    const res = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { id: Number(canonicalId) } }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      data?: {
        Media?: {
          id?: number;
          siteUrl?: string;
          title?: { romaji?: string | null; english?: string | null; native?: string | null };
          chapters?: number | null;
          description?: string | null;
          coverImage?: { large?: string | null };
          isAdult?: boolean | null;
          genres?: string[] | null;
        };
      };
    };
  });

  const media = json?.data?.Media;
  if (!media?.siteUrl) return null;
  const genres = (media.genres ?? []).map((genre) => String(genre).toLowerCase());
  const isHentai = genres.includes("hentai");
  const isEcchi = !isHentai && (genres.includes("ecchi") || Boolean(media.isAdult));
  return {
    title: media.title?.english || media.title?.romaji || media.title?.native || "",
    description: stripHtml(media.description || ""),
    totalChapters: typeof media.chapters === "number" && media.chapters > 0 ? media.chapters : null,
    sourceUrl: media.siteUrl,
    coverImageUrl: media.coverImage?.large || null,
    sourceSite: "anilist",
    canonicalId: media.id ? String(media.id) : canonicalId,
    contentCategory: isHentai ? "hentai" : isEcchi ? "ecchi" : "safe",
    confidence: 1,
    matchReason: "canonical-id",
  };
}

export async function fetchEnrichment(
  source: ImportSource,
  title: string,
  expectedChapters: number | null = null,
): Promise<Enrichment | null> {
  if (source === "mal") return await fetchMalByTitle(title, expectedChapters);
  return await fetchAniListByTitle(title, expectedChapters);
}

export async function fetchEnrichmentByCanonicalId(
  source: ImportSource,
  canonicalId: string,
): Promise<Enrichment | null> {
  if (!canonicalId.trim()) return null;
  if (source === "mal") return await fetchMalByCanonicalId(canonicalId.trim());
  return await fetchAniListByCanonicalId(canonicalId.trim());
}

