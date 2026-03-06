import type { ImportSeriesInput } from "@/lib/importers/mal";
import { tryDownloadCoverImage } from "@/lib/scrapers/cover-image";
import { fetchPageHtml } from "@/lib/scrapers/fetch-page";
import { resolveSiteByUrl } from "@/lib/scrapers/domain-registry";
import type { ScrapeRequest, ScrapedSeriesMetadata } from "@/lib/scrapers/types";

function metadataToImportInput(metadata: ScrapedSeriesMetadata, sourceType: "TR" | "EN"): ImportSeriesInput {
  const now = new Date().toISOString();

  return {
    title: metadata.title,
    totalChapters: metadata.totalChapters ?? 0,
    chaptersRead: 0,
    startDate: null,
    finishDate: null,
    rating: null,
    description: metadata.description,
    personalNotes: metadata.description,
    status: "plan_to_read",
    reread: false,
    novelToRead: false,
    followUpdates: true,
    preferredSourceType: sourceType,
    coverImageBlob: null,
    coverImageMimeType: null,
    coverImageFetchedAt: null,
    metadataFetchedAt: now,
    sources: [
      {
        type: sourceType,
        url: metadata.sourceUrl,
        site: metadata.site,
        canonicalId: metadata.canonicalId,
        scrapedAt: now,
        scraperName: "website-metadata-v1",
        lastError: null,
        meta: {
          tags: metadata.tags,
          alternativeTitles: metadata.alternativeTitles,
          coverImageUrl: metadata.coverImageUrl,
        },
      },
    ],
  };
}

export async function scrapeSeriesMetadata(request: ScrapeRequest): Promise<{
  metadata: ScrapedSeriesMetadata;
  importInput: ImportSeriesInput;
  usedPuppeteer: boolean;
  coverDownloaded: boolean;
}> {
  const { parser } = resolveSiteByUrl(request.url);
  const fetched = await fetchPageHtml(request.url);
  const metadata = parser({ finalUrl: fetched.finalUrl, html: fetched.html });
  const cover = await tryDownloadCoverImage(metadata.coverImageUrl, metadata.sourceUrl);

  const importInput = metadataToImportInput(metadata, request.sourceType);
  if (cover) {
    importInput.coverImageBlob = cover.blob;
    importInput.coverImageMimeType = cover.mimeType;
    importInput.coverImageFetchedAt = cover.fetchedAt;
  }

  return {
    metadata,
    importInput,
    usedPuppeteer: fetched.usedPuppeteer,
    coverDownloaded: Boolean(cover),
  };
}
