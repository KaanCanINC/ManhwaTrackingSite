import { NextResponse } from "next/server";
import { createBackup } from "@/lib/backup-service";

export const runtime = "nodejs";

export async function POST() {
  const result = createBackup("manual");
  return NextResponse.json({ data: result }, { status: 201 });
}
