import { NextResponse } from "next/server";
import { createBackup, listBackups } from "@/lib/backup-service";

export const runtime = "nodejs";

export async function POST() {
  const result = createBackup("manual");
  return NextResponse.json({ data: result }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ data: listBackups() });
}
