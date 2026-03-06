import type { ScraperSiteId, SiteScraper } from "@/lib/scrapers/types";
import { parseAsuraComic, parseAsuraScansTr } from "@/lib/scrapers/parsers/asura";
import { parseManhuaUs } from "@/lib/scrapers/parsers/manhuaus";

type SiteRegistration = {
  siteId: ScraperSiteId;
  parser: SiteScraper;
};

const HOST_REGISTRY = new Map<string, SiteRegistration>([
  ["asuracomic.net", { siteId: "asuracomic", parser: parseAsuraComic }],
  ["www.asuracomic.net", { siteId: "asuracomic", parser: parseAsuraComic }],
  ["manhuaus.com", { siteId: "manhuaus", parser: parseManhuaUs }],
  ["www.manhuaus.com", { siteId: "manhuaus", parser: parseManhuaUs }],
  ["asurascans.com.tr", { siteId: "asurascans-tr", parser: parseAsuraScansTr }],
  ["www.asurascans.com.tr", { siteId: "asurascans-tr", parser: parseAsuraScansTr }],
]);

export function resolveSiteByUrl(url: string): SiteRegistration {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const found = HOST_REGISTRY.get(host);

  if (!found) {
    throw new Error(`Unsupported domain: ${host}`);
  }

  return found;
}
