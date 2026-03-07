import type { SeriesStatus } from "@/lib/types";
import type { ImportSeriesInput } from "@/lib/importers/mal";

type AniListItem = {
  title?: string;
  progress?: number;
  score?: number;
  status?: string;
  startedAt?: { year?: number; month?: number; day?: number };
  completedAt?: { year?: number; month?: number; day?: number };
  notes?: string;
  episodes?: number;
};

type AniListCollectionEntry = {
  status?: string;
  score?: number;
  progress?: number;
  notes?: string;
  startedAt?: { year?: number; month?: number; day?: number };
  completedAt?: { year?: number; month?: number; day?: number };
  media?: {
    id?: number;
    siteUrl?: string;
    chapters?: number | null;
    title?: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    };
  };
};

function mapStatus(status?: string): SeriesStatus {
  switch ((status || "").toUpperCase()) {
    case "CURRENT":
      return "reading";
    case "COMPLETED":
      return "completed";
    default:
      return "plan_to_read";
  }
}

function fromDateObj(value?: { year?: number; month?: number; day?: number }): string | null {
  if (!value?.year || !value.month || !value.day) {
    return null;
  }
  const formatted = `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
  const date = new Date(formatted);
  return Number.isNaN(date.getTime()) ? null : formatted;
}

function normalizeImportedNotes(value: string | undefined): string {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function parseAnilistExport(content: string): ImportSeriesInput[] {
  const parsed = JSON.parse(content) as AniListItem[] | { entries?: AniListItem[] };
  const items = Array.isArray(parsed) ? parsed : parsed.entries || [];

  return items
    .filter((item) => item.title?.trim())
    .map((item) => ({
      title: String(item.title || "").trim(),
      totalChapters: Number(item.episodes || 0),
      chaptersRead: Number(item.progress || 0),
      startDate: fromDateObj(item.startedAt),
      finishDate: fromDateObj(item.completedAt),
      rating: item.score ? Math.max(1, Math.min(10, Math.round(item.score / 10))) : null,
      description: "",
      personalNotes: normalizeImportedNotes(item.notes),
      status: mapStatus(item.status),
      reread: false,
      novelToRead: false,
      followUpdates: true,
      preferredSourceType: "ANILIST",
      coverImageBlob: null,
      coverImageMimeType: null,
      coverImageFetchedAt: null,
      metadataFetchedAt: null,
      metadataSourceUrl: null,
      metadataSourceSite: null,
      metadataSourceCanonicalId: null,
      metadataSourceUpdatedAt: null,
      sources: [],
    }));
}

export async function fetchAnilistImportByNickname(nickname: string): Promise<ImportSeriesInput[]> {
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: MANGA) {
        lists {
          entries {
            status
            score(format: POINT_100)
            progress
            notes
            startedAt { year month day }
            completedAt { year month day }
            media {
              id
              siteUrl
              chapters
              title {
                romaji
                english
                native
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: { userName: nickname } }),
  });

  if (!res.ok) {
    throw new Error(`AniList nickname fetch failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data?: {
      MediaListCollection?: {
        lists?: Array<{ entries?: AniListCollectionEntry[] | null } | null>;
      } | null;
    };
  };

  const entries =
    json.data?.MediaListCollection?.lists?.flatMap((list) => list?.entries ?? []) ?? [];

  return entries
    .filter((entry) => {
      const media = entry.media;
      const title = media?.title?.english || media?.title?.romaji || media?.title?.native;
      return Boolean(title?.trim());
    })
    .map((entry) => {
      const media = entry.media;
      const title = media?.title?.english || media?.title?.romaji || media?.title?.native || "";
      const rawScore = Number(entry.score || 0);

      return {
        title: title.trim(),
        totalChapters: Number(media?.chapters || 0),
        chaptersRead: Number(entry.progress || 0),
        startDate: fromDateObj(entry.startedAt),
        finishDate: fromDateObj(entry.completedAt),
        rating: rawScore > 0 ? Math.max(1, Math.min(10, Math.round(rawScore / 10))) : null,
        description: "",
        personalNotes: normalizeImportedNotes(entry.notes),
        status: mapStatus(entry.status),
        reread: false,
        novelToRead: false,
        followUpdates: true,
        preferredSourceType: "ANILIST",
        coverImageBlob: null,
        coverImageMimeType: null,
        coverImageFetchedAt: null,
        metadataFetchedAt: null,
        metadataSourceUrl: media?.siteUrl || null,
        metadataSourceSite: media?.siteUrl ? "anilist" : null,
        metadataSourceCanonicalId: media?.id ? String(media.id) : null,
        metadataSourceUpdatedAt: media?.siteUrl ? new Date().toISOString() : null,
        sources: [],
      } satisfies ImportSeriesInput;
    });
}
