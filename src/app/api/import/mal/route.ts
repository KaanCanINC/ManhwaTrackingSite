import { NextRequest, NextResponse } from "next/server";
import { parseMalExport } from "@/lib/importers/mal";
import { runImport } from "@/lib/import-handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { content?: string; selectedIndices?: unknown[] };
  const content = String(body.content || "");
  const selectedIndices = Array.isArray(body.selectedIndices)
    ? body.selectedIndices.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
    : undefined;

  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const result = await runImport("mal", content, parseMalExport, "xml", undefined, { selectedIndices });
    return NextResponse.json({ data: { added: result.added, merged: result.merged } });
  } catch {
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
