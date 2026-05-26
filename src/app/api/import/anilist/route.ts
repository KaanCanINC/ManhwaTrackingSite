import { NextRequest, NextResponse } from "next/server";
import { normalizeNickname, isValidPublicNickname } from "@/lib/importers/nickname";
import { fetchAnilistImportByNickname } from "@/lib/importers/anilist";
import { parseMalExport } from "@/lib/importers/mal";
import { parseAnilistOrSeriesJsonImport } from "@/lib/importers/json-series";
import { mapImportError, parseSelectedIndices } from "@/lib/importers/api-utils";
import { runImport, runImportFromItems } from "@/lib/importers/handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    mode?: "content" | "nickname";
    content?: string;
    nickname?: string;
    selectedIndices?: unknown[];
  };
  const mode = body.mode || "content";
  const content = String(body.content || "");
  const nickname = normalizeNickname(body.nickname);
  const selectedIndices = parseSelectedIndices(body.selectedIndices);

  if (mode === "content" && !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  if (mode === "nickname" && !isValidPublicNickname(nickname)) {
    return NextResponse.json({ error: "nickname is invalid" }, { status: 400 });
  }

  try {
    const result =
      mode === "nickname"
        ? await runImportFromItems("anilist", await fetchAnilistImportByNickname(nickname), "json", undefined, {
            selectedIndices,
          })
        : await (async () => {
            const isXml = content.trimStart().startsWith("<");
            const parser = isXml ? parseMalExport : parseAnilistOrSeriesJsonImport;
            const extension = isXml ? "xml" : "json";
            return await runImport("anilist", content, parser, extension, undefined, {
              selectedIndices,
            });
          })();

    return NextResponse.json({
      data: {
        added: result.added,
        merged: result.merged,
        queuedEnrichment: result.queuedEnrichment,
      },
    });
  } catch (error) {
    const { message, status } = mapImportError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
