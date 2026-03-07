import { NextRequest, NextResponse } from "next/server";
import { enqueueImportEnrichmentJobs } from "@/lib/enrichment/queue";
import { getSeriesById } from "@/lib/series-repository";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    source?: "mal" | "anilist" | "auto";
  };

  const series = getSeriesById(id);
  if (!series) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  const hasMal = series.metadataSourceSite === "myanimelist";
  const hasAnilist = series.metadataSourceSite === "anilist";

  if (!hasMal && !hasAnilist) {
    return NextResponse.json({ error: "Series is not imported from MAL/AniList" }, { status: 400 });
  }

  const requested = body.source || "auto";
  const chosenSource =
    requested === "mal" && hasMal
      ? "mal"
      : requested === "anilist" && hasAnilist
        ? "anilist"
        : series.preferredSourceType === "MAL" && hasMal
          ? "mal"
          : series.preferredSourceType === "ANILIST" && hasAnilist
            ? "anilist"
            : hasMal
              ? "mal"
              : "anilist";

  const queued = enqueueImportEnrichmentJobs(chosenSource, [series.id]);

  return NextResponse.json({
    data: {
      source: chosenSource,
      queued,
      alreadyPending: queued === 0,
    },
  });
}
