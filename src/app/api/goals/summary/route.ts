import { NextResponse } from "next/server";
import { getGoalsSummary } from "@/lib/goals-service";

export const runtime = "nodejs";

export async function GET() {
  const data = getGoalsSummary();
  return NextResponse.json({ data });
}
