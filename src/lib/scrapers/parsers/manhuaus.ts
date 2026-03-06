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
import type { SiteScraper } from "@/lib/scrapers/types";

export const parseManhuaUs: SiteScraper = ({ finalUrl, html }) => {
  const title = sanitizeTitle(extractTitle(html));

  if (!title) {
    throw new Error("Unable to parse title for manhuaus");
  }

  return {
    title,
    description: extractDescription(html),
    coverImageUrl: extractCoverImageUrl(html),
    tags: extractTags(html),
    alternativeTitles: extractAlternativeTitles(html),
    canonicalId: getCanonicalSlug(finalUrl),
    site: "manhuaus",
    sourceUrl: finalUrl,
    totalChapters: extractTotalChapters(html),
  };
};
