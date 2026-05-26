import { NextRequest, NextResponse } from "next/server";
import { normalizeNickname, isValidPublicNickname } from "@/lib/importers/nickname";
import { getImportPreviewFromItems } from "@/lib/importers/handler";
import { fetchAnilistImportByNickname } from "@/lib/importers/anilist";
import { fetchMalImportByNickname, parseMalExport } from "@/lib/importers/mal";
import { parseAnilistOrSeriesJsonImport, parseSeriesJsonImport } from "@/lib/importers/json-series";
import { mapImportError } from "@/lib/importers/api-utils";

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

    const parser = content.trimStart().startsWith("<")
      ? parseMalExport
      : source === "mal"
        ? parseSeriesJsonImport
        : parseAnilistOrSeriesJsonImport;

    const items = getImportPreviewFromItems(parser(content));
    return NextResponse.json({ data: { items } });
  } catch (error) {
    const { message, status } = mapImportError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
