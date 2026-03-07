import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createChangeBackupIfCooledDown, runDailyBackupIfNeeded } from "@/lib/backup-service";
import { createSeries, getStatusCounts, listSeries } from "@/lib/series-repository";

export const runtime = "nodejs";

function toBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  return value === "true";
}

export async function GET(request: NextRequest) {
  runDailyBackupIfNeeded();

  const { searchParams } = new URL(request.url);
  const filters = {
    query: searchParams.get("query") || undefined,
    status:
      (searchParams.get("status") as
        | "plan_to_read"
        | "reading"
        | "completed"
        | "dropped"
        | "up_to_date"
        | null) || undefined,
    reread: toBoolean(searchParams.get("reread")),
    novelToRead: toBoolean(searchParams.get("novelToRead")),
    followUpdates: toBoolean(searchParams.get("followUpdates")),
  };

  const data = listSeries(filters);
  const statusCounts = getStatusCounts({
    query: filters.query,
    reread: filters.reread,
    novelToRead: filters.novelToRead,
    followUpdates: filters.followUpdates,
  });

  return NextResponse.json({ data, meta: { statusCounts } });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    if (typeof payload.coverImageBase64 === "string" && payload.coverImageBase64.trim()) {
      payload.coverImageBlob = Buffer.from(payload.coverImageBase64, "base64");
    }
    const created = createSeries(payload);
    createChangeBackupIfCooledDown();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && /metadata source/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
