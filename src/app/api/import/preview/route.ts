import { NextRequest, NextResponse } from "next/server";
import { normalizeNickname, isValidPublicNickname } from "@/lib/importers/nickname";
import { getImportPreviewFromItems } from "@/lib/importers/handler";
import { fetchAnilistImportByNickname, parseAnilistExport } from "@/lib/importers/anilist";
import { fetchMalImportByNickname, parseMalExport } from "@/lib/importers/mal";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: "mal" | "anilist";
    mode?: "content" | "nickname";
    content?: string;
    nickname?: string;
  };

  const source = body.source;
  const mode = body.mode || "content";
  const content = String(body.content || "");
  const nickname = normalizeNickname(body.nickname);

  if (!source || (source !== "mal" && source !== "anilist")) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  if (mode === "content" && !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  if (mode === "nickname") {
    if (!isValidPublicNickname(nickname)) {
      return NextResponse.json({ error: "nickname is invalid" }, { status: 400 });
    }
  }

  try {
    if (mode === "nickname") {
      const items =
        source === "mal"
          ? await fetchMalImportByNickname(nickname)
          : await fetchAnilistImportByNickname(nickname);

      return NextResponse.json({ data: { items: getImportPreviewFromItems(items) } });
    }

    const parser =
      source === "mal"
        ? parseMalExport
        : content.trimStart().startsWith("<")
          ? parseMalExport
          : parseAnilistExport;

    const items = getImportPreviewFromItems(parser(content));
    return NextResponse.json({ data: { items } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    const status = /invalid|not found|private|rate limited|required|format/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
