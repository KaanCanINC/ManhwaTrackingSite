import { NextResponse } from "next/server";
import { getImportEnrichmentStats, startEnrichmentWorker } from "@/lib/enrichment/queue";

export const runtime = "nodejs";

export async function GET() {
  // Ensure pending jobs resume after process restarts.
  startEnrichmentWorker();
  return NextResponse.json({ data: getImportEnrichmentStats() });
}
