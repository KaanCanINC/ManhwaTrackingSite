const META_PATTERNS = {
  ogTitle: /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ogDescription: /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  ogImage: /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  twitterTitle: /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  twitterDescription: /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  titleTag: /<title[^>]*>([^<]+)<\/title>/i,
};

const JSON_LD_PATTERN = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const URL_NUMBER_PATTERN = /\/(?:chapter|chap(?:ter)?|bolum|b[o\u00f6]l[u\u00fc]m|episode|ep)[-_ ]?(\d{1,5}(?:\.\d+)?)(?:\/|\?|$)/giu;

type JsonLdCandidate = {
  name: string | null;
  description: string | null;
  image: string | null;
  alternateNames: string[];
};

function decodeHtmlEntities(input: string): string {
  const decoded = input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

  return decoded.replace(/&#(\d+);/g, (_, digits: string) => {
    const code = Number(digits);
    return Number.isFinite(code) ? String.fromCharCode(code) : _;
  });
}

function stripHtml(input: string): string {
  return cleanText(input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return [cleanText(value)].filter(Boolean);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => cleanText(item)).filter(Boolean);
}

function pickImage(value: unknown): string | null {
  if (typeof value === "string") {
    return cleanText(value) || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickImage(item);
      if (picked) return picked;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string") {
      return cleanText(record.url) || null;
    }
  }
  return null;
}

function toCandidate(obj: unknown): JsonLdCandidate | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const record = obj as Record<string, unknown>;
  const name = typeof record.name === "string" ? cleanText(record.name) : typeof record.headline === "string" ? cleanText(record.headline) : null;
  const description = typeof record.description === "string" ? stripHtml(record.description) : null;
  const image = pickImage(record.image);
  const alternateNames = toStringArray(record.alternateName);
  if (!name && !description && !image && alternateNames.length === 0) {
    return null;
  }
  return { name: name || null, description: description || null, image, alternateNames };
}

function collectJsonLdCandidates(html: string): JsonLdCandidate[] {
  const candidates: JsonLdCandidate[] = [];

  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    const parsed = parseJsonString(match[1] || "");
    if (!parsed) continue;

    const pushFrom = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) pushFrom(item);
        return;
      }
      if (value && typeof value === "object" && "@graph" in (value as Record<string, unknown>)) {
        pushFrom((value as Record<string, unknown>)["@graph"]);
      }
      const candidate = toCandidate(value);
      if (candidate) candidates.push(candidate);
    };

    pushFrom(parsed);
  }

  return candidates;
}

function looksLikeSeoBoilerplate(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("orijinal") ||
    lowered.includes("preview") ||
    lowered.includes("all rights reserved") ||
    lowered.includes("dmca") ||
    lowered.includes("privacy policy") ||
    lowered.includes("manga oku") ||
    lowered.includes("webtoon oku")
  );
}

function extractSummaryContent(html: string): string | null {
  const blocks: string[] = [];
  const classPattern = /<div[^>]*class=["'][^"']*(summary__content|summary-content|description-summary|manga-excerpt|entry-content)[^"']*["'][^>]*>([\s\S]{0,5000}?)<\/div>/gi;

  for (const match of html.matchAll(classPattern)) {
    const text = stripHtml(match[2] || "");
    if (text.length >= 40 && !looksLikeSeoBoilerplate(text)) {
      blocks.push(text);
    }
  }

  const best = blocks.sort((a, b) => b.length - a.length)[0];
  return best || null;
}

export function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  const compact = input.replace(/\s+/g, " ").trim();
  return decodeHtmlEntities(compact);
}

export function extractMetaContent(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ? cleanText(match[1]) : null;
}

export function extractTitle(html: string): string {
  const jsonLd = collectJsonLdCandidates(html);
  const jsonTitle = jsonLd.find((item) => item.name && item.name.length > 1)?.name;

  return (
    jsonTitle ||
    extractMetaContent(html, META_PATTERNS.ogTitle) ||
    extractMetaContent(html, META_PATTERNS.twitterTitle) ||
    extractMetaContent(html, META_PATTERNS.titleTag) ||
    ""
  );
}

export function extractDescription(html: string): string {
  const jsonLd = collectJsonLdCandidates(html);
  const jsonDesc = jsonLd.find((item) => item.description && item.description.length > 20)?.description;
  const summaryDesc = extractSummaryContent(html);

  return (
    jsonDesc ||
    summaryDesc ||
    extractMetaContent(html, META_PATTERNS.ogDescription) ||
    extractMetaContent(html, META_PATTERNS.twitterDescription) ||
    ""
  );
}

export function extractCoverImageUrl(html: string): string | null {
  const jsonLd = collectJsonLdCandidates(html);
  const jsonImage = jsonLd.find((item) => item.image)?.image;
  if (jsonImage) return jsonImage;
  return extractMetaContent(html, META_PATTERNS.ogImage);
}

export function sanitizeTitle(title: string): string {
  return title
    .replace(/\s*\|\s*Asura[^|]*$/i, "")
    .replace(/\s*\|\s*ManhuaUS[^|]*$/i, "")
    .replace(/\s*\|\s*MerlinToon.*$/i, "")
    .replace(/\s+-\s+Read Manga.*$/i, "")
    .replace(/\s+-\s*(G[o\u00f6]lge\s*Bah[\u00e7c]esi|Nemesis\s*Scans|Serein\s*Scan|Manga\s*Oku|Manga)\s*$/iu, "")
    .replace(/\s+-\s*Paradox\s*Scans.*$/i, "")
    .replace(/\s+-\s*Manhwa\s*ve\s*Manhua\s*okumak\s*i[c\u00e7]in\s*t[\u0131i]kla\.?\s*$/iu, "")
    .replace(/\s*oku\s*-\s*.*$/i, "")
    .replace(/\s+oku\s*$/i, "")
    .replace(/^\s*just a moment\.\.\.\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractTags(html: string): string[] {
  const found = new Set<string>();
  const blockPattern = /(genre|genres|tag|tags)[\s\S]{0,900}/gi;
  const textPattern = />\s*([A-Za-z0-9][A-Za-z0-9\s\-']{2,30})\s*</g;

  for (const blockMatch of html.matchAll(blockPattern)) {
    const block = blockMatch[0];
    for (const textMatch of block.matchAll(textPattern)) {
      const candidate = cleanText(textMatch[1]);
      if (!candidate) continue;
      if (/^(genre|genres|tag|tags|manga|manhwa)$/i.test(candidate)) continue;
      found.add(candidate);
      if (found.size >= 20) break;
    }
  }

  return [...found];
}

export function extractAlternativeTitles(html: string): string[] {
  const found = new Set<string>();
  const jsonLd = collectJsonLdCandidates(html);

  for (const item of jsonLd) {
    for (const alt of item.alternateNames) {
      if (alt.length >= 2 && alt.length <= 120) {
        found.add(alt);
      }
      if (found.size >= 20) break;
    }
    if (found.size >= 20) break;
  }

  const blocks = html.matchAll(/(alternative\s*name|alternative\s*titles?|other\s*names?)[\s\S]{0,1200}/gi);

  for (const block of blocks) {
    const raw = block[0]
      .replace(/<br\s*\/?>/gi, "|")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const normalized = raw
      .replace(/^(alternative\s*name|alternative\s*titles?|other\s*names?)\s*[:\-]?\s*/i, "")
      .trim();

    for (const part of normalized.split(/\||,|\//g)) {
      const candidate = cleanText(part);
      if (!candidate) continue;
      if (candidate.length < 2 || candidate.length > 120) continue;
      if (/^(alternative\s*name|alternative\s*titles?|other\s*names?)$/i.test(candidate)) continue;
      if (/(class=|<svg|viewbox=|width=|height=|trend|yazar:|author:)/i.test(candidate)) continue;
      if ((candidate.match(/[^a-z0-9\s\-'.,:&]/gi) || []).length > candidate.length / 3) continue;
      found.add(candidate);
      if (found.size >= 20) break;
    }

    if (found.size >= 20) break;
  }

  return [...found];
}

export function extractTotalChapters(html: string): number | null {
  let max = 0;
  const chapterPattern = /(?:chapter|chap(?:ter)?|b[o\u00f6]l[u\u00fc]m|bolum|episode|ep)\s*[-:#.]?\s*(\d{1,5}(?:\.\d+)?)/giu;

  for (const match of html.matchAll(chapterPattern)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > max) {
      max = Math.floor(parsed);
    }
  }

  for (const match of html.matchAll(URL_NUMBER_PATTERN)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > max) {
      max = Math.floor(parsed);
    }
  }

  return max > 0 ? max : null;
}

export function getCanonicalSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    const anchorIndex = parts.findIndex((part) => ["manga", "series", "comic", "manhwa"].includes(part));
    if (anchorIndex >= 0 && parts[anchorIndex + 1]) {
      return parts[anchorIndex + 1].toLowerCase();
    }

    return parts[parts.length - 1].toLowerCase() || null;
  } catch {
    return null;
  }
}
