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

function registerGenericHost(host: string, forcedSiteId?: string) {
  const siteId = forcedSiteId ?? toSiteId(host);
  registerHost(host, createGenericSiteParser(siteId), siteId);
}

registerHost("asuracomic.net", parseAsuraComic, "asuracomic");
registerHost("asurascans.com", parseAsuraComic, "asuracomic");
registerHost("manhuaus.com", parseManhuaUs, "manhuaus");
registerHost("asurascans.com.tr", parseAsuraScansTr, "asurascans-tr");

const GENERIC_MADARA_HOSTS = [
  "golgebahcesi.com",
  "tilkiscans.com",
  "nabimanga.com",
  "webtoonhatti.club",
  "demonicscans.org",
  "vortexscans.org",
  "manhwaclan.co.uk",
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
  registerGenericHost(host);
}

// Mirror domain using same site identity to avoid split canonical namespaces.
registerGenericHost("nabicix.com", "nabimanga-com");
registerGenericHost("manhwaclan.com", "manhwaclan-co-uk");
registerGenericHost("xn--webtoonhatt-9zb.club", "webtoonhatti-club");

// Optional runtime extension for host-only additions without code changes.
const EXTRA_GENERIC_HOSTS = (process.env.EXTRA_GENERIC_SCRAPER_HOSTS || "")
  .split(",")
  .map((host) => canonicalHost(host))
  .filter(Boolean);

for (const host of EXTRA_GENERIC_HOSTS) {
  registerGenericHost(host);
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
