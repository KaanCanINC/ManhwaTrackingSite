import { NextRequest, NextResponse } from "next/server";
import { retryFailedImportEnrichmentJobs } from "@/lib/enrichment/queue";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const parsed = Number(body.limit);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : 100;

  const result = retryFailedImportEnrichmentJobs(limit);
  return NextResponse.json({ data: result });
}
