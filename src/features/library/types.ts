import type { PreferredSourceType, SeriesContentType, SeriesStatus, SourceType } from "@/lib/types";
import type { RereadSessionForm } from "@/utils/ui-utils";

export type ScrapeWebsiteResponse = {
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

export type SourceMetaOverride = {
  site: string | null;
  canonicalId: string | null;
  scrapedAt: string | null;
  scraperName: string | null;
  lastError: { message: string; timestamp: string } | null;
  meta: Record<string, unknown> | null;
};

export type FormState = {
  title: string;
  totalChapters: number;
  chaptersRead: number;
  status: SeriesStatus;
  rating: number | "";
  description: string;
  personalNotes: string;
  reread: boolean;
  totalRereads: number;
  rereadSessions: RereadSessionForm[];
  novelToRead: boolean;
  followUpdates: boolean;
  contentType: SeriesContentType | null;
  startDate: string;
  finishDate: string;
  trUrl: string;
  enUrl: string;
  preferredSourceType: PreferredSourceType | null;
  coverImageBase64: string | null;
  coverImageMimeType: string | null;
  coverImageFetchedAt: string | null;
};

export const EMPTY_FORM: FormState = {
  title: "",
  totalChapters: 0,
  chaptersRead: 0,
  status: "plan_to_read",
  rating: "",
  description: "",
  personalNotes: "",
  reread: false,
  totalRereads: 0,
  rereadSessions: [],
  novelToRead: false,
  followUpdates: true,
  contentType: null,
  startDate: "",
  finishDate: "",
  trUrl: "",
  enUrl: "",
  preferredSourceType: null,
  coverImageBase64: null,
  coverImageMimeType: null,
  coverImageFetchedAt: null,
};
