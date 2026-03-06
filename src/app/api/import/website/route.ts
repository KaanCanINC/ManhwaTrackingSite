import { NextRequest, NextResponse } from "next/server";
import { runImport } from "@/lib/import-handler";
import { batchMergeSeriesByCanonicalOrTitle } from "@/lib/series-repository";
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

    const artifact = {
      request: {
        url: parsedUrl.toString(),
        sourceType,
      },
      metadata: scraped.metadata,
      usedPuppeteer: scraped.usedPuppeteer,
      coverDownloaded: scraped.coverDownloaded,
      importedAt: new Date().toISOString(),
    };

    const result = runImport(
      "website",
      JSON.stringify(artifact, null, 2),
      () => [scraped.importInput],
      "json",
      batchMergeSeriesByCanonicalOrTitle,
    );

    return NextResponse.json({
      data: {
        added: result.added,
        merged: result.merged,
        fileName: result.fileName,
        sourceType,
        usedPuppeteer: scraped.usedPuppeteer,
        coverDownloaded: scraped.coverDownloaded,
        canonicalId: scraped.metadata.canonicalId,
        site: scraped.metadata.site,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
