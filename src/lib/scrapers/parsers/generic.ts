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
import type { ScraperSiteId, SiteScraper } from "@/lib/scrapers/types";

export function createGenericSiteParser(site: ScraperSiteId): SiteScraper {
  return ({ finalUrl, html }) => {
    const title = sanitizeTitle(extractTitle(html));

    if (!title) {
      throw new Error(`Unable to parse title for ${site}`);
    }

    const description = extractDescription(html);
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const normalizedDescription = description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    return {
      title,
      description: normalizedDescription === normalizedTitle ? "" : description,
      coverImageUrl: extractCoverImageUrl(html),
      tags: extractTags(html),
      alternativeTitles: extractAlternativeTitles(html),
      canonicalId: getCanonicalSlug(finalUrl),
      site,
      sourceUrl: finalUrl,
      totalChapters: extractTotalChapters(html),
    };
  };
}
