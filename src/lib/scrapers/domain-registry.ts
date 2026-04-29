import type { ScraperSiteId, SiteScraper } from "@/lib/scrapers/types";
import { parseAsuraComic, parseAsuraScansTr } from "@/lib/scrapers/parsers/asura";
import { parseManhuaUs } from "@/lib/scrapers/parsers/manhuaus";
import { createGenericSiteParser } from "@/lib/scrapers/parsers/generic";

type SiteRegistration = {
  siteId: ScraperSiteId;
  parser: SiteScraper;
};

function canonicalHost(host: string): string {
  const lowered = host.trim().toLowerCase();
  return lowered.startsWith("www.") ? lowered.slice(4) : lowered;
}

function toSiteId(host: string): string {
  return canonicalHost(host)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HOST_REGISTRY = new Map<string, SiteRegistration>();

function registerHost(host: string, parser: SiteScraper, siteId = toSiteId(host)) {
  HOST_REGISTRY.set(canonicalHost(host), { siteId, parser });
}

registerHost("asuracomic.net", parseAsuraComic, "asuracomic");
registerHost("manhuaus.com", parseManhuaUs, "manhuaus");
registerHost("asurascans.com.tr", parseAsuraScansTr, "asurascans-tr");

const GENERIC_MADARA_HOSTS = [
  "golgebahcesi.com",
  "tilkiscans.com",
  "nabimanga.com",
  "nemesisscans.com",
  "nirvanamanga.com",
  "paradoxscans.com",
  "patimanga.com",
  "ragnarscans.com",
  "sereinscan.net",
  "manga-sehri.net",
  "merlintoon.com",
  "ruyamanga.net",
  "ruyamanga2.com",
  "mangahanedanligi.com",
  "mangaruhu.com",
  "hayalistic.net",
  "arcurafansub.com",
];

for (const host of GENERIC_MADARA_HOSTS) {
  registerHost(host, createGenericSiteParser(toSiteId(host)));
}

export function resolveSiteByUrl(url: string): SiteRegistration {
  const parsed = new URL(url);
  const host = canonicalHost(parsed.hostname);
  const found = HOST_REGISTRY.get(host);

  if (!found) {
    throw new Error(`Unsupported domain: ${host}`);
  }

  return found;
}
