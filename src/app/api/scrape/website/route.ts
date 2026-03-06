import { NextRequest, NextResponse } from "next/server";
import { scrapeSeriesMetadata } from "@/lib/scrapers";

export const runtime = "nodejs";

function inferSourceType(url: URL): "TR" | "EN" {
  if (url.hostname.endsWith(".tr") || url.hostname.includes("turk")) {
    return "TR";
  }
  return "EN";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const rawUrl = String(body.url || "").trim();
  const explicitSourceType = body.sourceType;

  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "url must be valid" }, { status: 400 });
  }

  const sourceType = explicitSourceType === "TR" || explicitSourceType === "EN"
    ? explicitSourceType
    : inferSourceType(parsedUrl);

  try {
    const scraped = await scrapeSeriesMetadata({
      url: parsedUrl.toString(),
      sourceType,
    });

    const blob = scraped.importInput.coverImageBlob;

    return NextResponse.json({
      data: {
        sourceType,
        usedPuppeteer: scraped.usedPuppeteer,
        coverDownloaded: scraped.coverDownloaded,
        metadata: {
          title: scraped.metadata.title,
          totalChapters: scraped.metadata.totalChapters,
          description: scraped.metadata.description,
          tags: scraped.metadata.tags,
          alternativeTitles: scraped.metadata.alternativeTitles,
          canonicalId: scraped.metadata.canonicalId,
          site: scraped.metadata.site,
          sourceUrl: scraped.metadata.sourceUrl,
          coverImageUrl: scraped.metadata.coverImageUrl,
        },
        coverImage: blob
          ? {
              base64: Buffer.from(blob).toString("base64"),
              mimeType: scraped.importInput.coverImageMimeType || "image/jpeg",
              fetchedAt: scraped.importInput.coverImageFetchedAt,
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
