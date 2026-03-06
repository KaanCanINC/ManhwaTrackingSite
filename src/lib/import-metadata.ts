import type { ImportSeriesInput } from "@/lib/importers/mal";
import { tryDownloadCoverImage } from "@/lib/scrapers/cover-image";

type ImportSource = "mal" | "anilist";

type Enrichment = {
  title: string;
  description: string;
  totalChapters: number | null;
  sourceUrl: string;
  coverImageUrl: string | null;
  sourceSite: "myanimelist" | "anilist";
  canonicalId: string | null;
};

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchMalByTitle(title: string): Promise<Enrichment | null> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", title);
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: Array<{
      mal_id?: number;
      title?: string;
      chapters?: number | null;
      synopsis?: string | null;
      url?: string;
      images?: { jpg?: { image_url?: string }; webp?: { image_url?: string } };
    }>;
  };

  const first = json.data?.[0];
  if (!first?.title || !first.url) return null;

  return {
    title: first.title,
    description: first.synopsis?.trim() || "",
    totalChapters: typeof first.chapters === "number" && first.chapters > 0 ? first.chapters : null,
    sourceUrl: first.url,
    coverImageUrl: first.images?.webp?.image_url || first.images?.jpg?.image_url || null,
    sourceSite: "myanimelist",
    canonicalId: first.mal_id ? String(first.mal_id) : null,
  };
}

async function fetchAniListByTitle(title: string): Promise<Enrichment | null> {
  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        id
        siteUrl
        title {
          romaji
          english
          native
        }
        chapters
        description(asHtml: false)
        coverImage {
          large
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: { search: title } }),
  });

  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: {
      Media?: {
        id?: number;
        siteUrl?: string;
        title?: { romaji?: string | null; english?: string | null; native?: string | null };
        chapters?: number | null;
        description?: string | null;
        coverImage?: { large?: string | null };
      };
    };
  };

  const media = json.data?.Media;
  if (!media?.siteUrl) return null;

  const bestTitle = media.title?.english || media.title?.romaji || media.title?.native || title;

  return {
    title: bestTitle,
    description: stripHtml(media.description || ""),
    totalChapters: typeof media.chapters === "number" && media.chapters > 0 ? media.chapters : null,
    sourceUrl: media.siteUrl,
    coverImageUrl: media.coverImage?.large || null,
    sourceSite: "anilist",
    canonicalId: media.id ? String(media.id) : null,
  };
}

async function fetchEnrichment(source: ImportSource, title: string): Promise<Enrichment | null> {
  if (source === "mal") return await fetchMalByTitle(title);
  return await fetchAniListByTitle(title);
}

export async function enrichImportedItems(source: ImportSource, items: ImportSeriesInput[]): Promise<ImportSeriesInput[]> {
  const now = new Date().toISOString();

  return await Promise.all(
    items.map(async (item) => {
      try {
        const enriched = await fetchEnrichment(source, item.title);
        if (!enriched) return item;

        const cover = await tryDownloadCoverImage(enriched.coverImageUrl, enriched.sourceUrl);

        return {
          ...item,
          title: enriched.title || item.title,
          totalChapters:
            item.totalChapters > 0
              ? item.totalChapters
              : (enriched.totalChapters ?? item.totalChapters),
          description: enriched.description || item.description,
          preferredSourceType: source === "mal" ? "MAL" : "ANILIST",
          metadataFetchedAt: now,
          coverImageBlob: cover?.blob ?? item.coverImageBlob ?? null,
          coverImageMimeType: cover?.mimeType ?? item.coverImageMimeType ?? null,
          coverImageFetchedAt: cover?.fetchedAt ?? item.coverImageFetchedAt ?? null,
          sources: [
            {
              type: "EN",
              url: enriched.sourceUrl,
              site: enriched.sourceSite,
              canonicalId: enriched.canonicalId,
              scrapedAt: now,
              scraperName: `import-${source}-enrichment-v1`,
              lastError: null,
              meta: {
                importedFrom: source,
              },
            },
            ...item.sources,
          ],
        } satisfies ImportSeriesInput;
      } catch {
        return item;
      }
    }),
  );
}
