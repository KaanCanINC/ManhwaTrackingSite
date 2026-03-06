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
      personalNotes: item.notes || "",
      status: mapStatus(item.status),
      reread: false,
      novelToRead: false,
      followUpdates: true,
      preferredSourceType: "ANILIST",
      coverImageBlob: null,
      coverImageMimeType: null,
      coverImageFetchedAt: null,
      metadataFetchedAt: null,
      sources: [],
    }));
}
