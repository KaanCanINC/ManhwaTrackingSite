import { NextRequest, NextResponse } from "next/server";
import { parseAnilistExport } from "@/lib/importers/anilist";
import { parseMalExport } from "@/lib/importers/mal";
import { getImportPreview } from "@/lib/import-handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: "mal" | "anilist";
    content?: string;
  };

  const source = body.source;
  const content = String(body.content || "");

  if (!source || (source !== "mal" && source !== "anilist")) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const parser =
      source === "mal"
        ? parseMalExport
        : content.trimStart().startsWith("<")
          ? parseMalExport
          : parseAnilistExport;

    const items = getImportPreview(content, parser);
    return NextResponse.json({ data: { items } });
  } catch {
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
