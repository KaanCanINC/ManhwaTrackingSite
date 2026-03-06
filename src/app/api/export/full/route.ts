import { NextResponse } from "next/server";
import { exportFullDatabase } from "@/lib/exporters";

export const runtime = "nodejs";

export async function GET() {
  const payload = exportFullDatabase();
  return NextResponse.json({ data: payload });
}
