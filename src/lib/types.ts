export type SeriesStatus = "plan_to_read" | "reading" | "completed" | "dropped" | "up_to_date";
export type SourceType = "TR" | "EN";

export interface SourceErrorInfo {
  message: string;
  timestamp: string;
}

export interface RereadSession {
  startDate: string | null;
  finishDate: string | null;
}

export interface SeriesSource {
  id: string;
  seriesId: string;
  type: SourceType;
  url: string;
  site: string | null;
  canonicalId: string | null;
  scrapedAt: string | null;
  scraperName: string | null;
  lastError: SourceErrorInfo | null;
  meta: Record<string, unknown> | null;
}

export interface Series {
  id: string;
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
  totalRereads: number;
  rereadSessions: RereadSession[];
  novelToRead: boolean;
  followUpdates: boolean;
  createdAt: string;
  updatedAt: string;
  hasCoverImage: boolean;
  coverImageMimeType: string | null;
  coverImageFetchedAt: string | null;
  metadataFetchedAt: string | null;
  preferredSourceType: SourceType | null;
  sources: SeriesSource[];
}

export interface SeriesFilters {
  query?: string;
  status?: SeriesStatus;
  reread?: boolean;
  novelToRead?: boolean;
  followUpdates?: boolean;
}

export interface BackupRecord {
  id: string;
  fileName: string;
  reason: string;
  createdAt: string;
}
