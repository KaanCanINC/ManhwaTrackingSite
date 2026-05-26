import { NextRequest, NextResponse } from "next/server";
import { listOperationHistory } from "@/lib/operation-history";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "50");
  const maxAgeDays = Number(searchParams.get("maxAgeDays") || "7");

  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    return NextResponse.json({ error: "limit must be between 1 and 200" }, { status: 400 });
  }

  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0 || maxAgeDays > 365) {
    return NextResponse.json({ error: "maxAgeDays must be between 1 and 365" }, { status: 400 });
  }

  const data = listOperationHistory(limit, maxAgeDays);
  return NextResponse.json({ data });
}
