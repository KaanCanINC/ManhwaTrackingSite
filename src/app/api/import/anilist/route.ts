import { NextRequest, NextResponse } from "next/server";
import { parseAnilistExport } from "@/lib/importers/anilist";
import { runImport } from "@/lib/import-handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const content = String(body.content || "");

  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const result = runImport("anilist", content, parseAnilistExport, "json");
    return NextResponse.json({ data: { added: result.added, merged: result.merged } });
  } catch {
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
