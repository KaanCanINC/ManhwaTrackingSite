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

function titleFromSlug(url: string): string {
  const slug = getCanonicalSlug(url);
  if (!slug) return "";

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

export function createGenericSiteParser(site: ScraperSiteId): SiteScraper {
  return ({ finalUrl, html }) => {
    const extractedTitle = sanitizeTitle(extractTitle(html));
    const title = extractedTitle || titleFromSlug(finalUrl);

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
