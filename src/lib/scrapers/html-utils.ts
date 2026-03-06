const META_PATTERNS = {
  ogTitle: /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ogDescription: /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  ogImage: /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  twitterTitle: /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  twitterDescription: /<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  titleTag: /<title[^>]*>([^<]+)<\/title>/i,
};

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
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
  return (
    extractMetaContent(html, META_PATTERNS.ogTitle) ||
    extractMetaContent(html, META_PATTERNS.twitterTitle) ||
    extractMetaContent(html, META_PATTERNS.titleTag) ||
    ""
  );
}

export function extractDescription(html: string): string {
  return (
    extractMetaContent(html, META_PATTERNS.ogDescription) ||
    extractMetaContent(html, META_PATTERNS.twitterDescription) ||
    ""
  );
}

export function extractCoverImageUrl(html: string): string | null {
  return extractMetaContent(html, META_PATTERNS.ogImage);
}

export function sanitizeTitle(title: string): string {
  return title
    .replace(/\s*\|\s*Asura[^|]*$/i, "")
    .replace(/\s*\|\s*ManhuaUS[^|]*$/i, "")
    .replace(/\s+-\s+Read Manga.*$/i, "")
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
      found.add(candidate);
      if (found.size >= 20) break;
    }

    if (found.size >= 20) break;
  }

  return [...found];
}

export function extractTotalChapters(html: string): number | null {
  let max = 0;
  const chapterPattern = /chapter\s*(\d{1,4}(?:\.\d+)?)/gi;

  for (const match of html.matchAll(chapterPattern)) {
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
