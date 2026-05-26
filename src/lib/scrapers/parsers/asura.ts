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

function isBadTitle(value: string): boolean {
  const lowered = value.toLowerCase().trim();
  return lowered === "just a moment..." || lowered === "just a moment" || lowered === "page not found" || lowered === "lost in the void";
}

function build(site: ScrapedSeriesMetadata["site"], finalUrl: string, html: string): ScrapedSeriesMetadata {
  const extractedTitle = sanitizeTitle(extractTitle(html));
  const title = !extractedTitle || isBadTitle(extractedTitle) ? titleFromSlug(finalUrl) : extractedTitle;

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
}

export const parseAsuraComic: SiteScraper = ({ finalUrl, html }) => build("asuracomic", finalUrl, html);

export const parseAsuraScansTr: SiteScraper = ({ finalUrl, html }) => build("asurascans-tr", finalUrl, html);
