import {
  extractAlternativeTitles,
  extractCoverImageUrl,
  extractDescription,
  extractTags,
  extractTotalChapters,
  extractTitle,
  getCanonicalSlug,
  sanitizeTitle,
} from "@/lib/scrapers/html-utils";
import type { ScrapedSeriesMetadata, SiteScraper } from "@/lib/scrapers/types";

function build(site: ScrapedSeriesMetadata["site"], finalUrl: string, html: string): ScrapedSeriesMetadata {
  const title = sanitizeTitle(extractTitle(html));

  if (!title) {
    throw new Error(`Unable to parse title for ${site}`);
  }

  return {
    title,
    description: extractDescription(html),
    coverImageUrl: extractCoverImageUrl(html),
    tags: extractTags(html),
    alternativeTitles: extractAlternativeTitles(html),
    canonicalId: getCanonicalSlug(finalUrl),
    site,
    sourceUrl: finalUrl,
    totalChapters: extractTotalChapters(html),
  };
}

export const parseAsuraComic: SiteScraper = ({ finalUrl, html }) => build("asuracomic", finalUrl, html);

export const parseAsuraScansTr: SiteScraper = ({ finalUrl, html }) => build("asurascans-tr", finalUrl, html);
