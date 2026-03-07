import { NextRequest, NextResponse } from "next/server";
import { normalizeNickname, isValidPublicNickname } from "@/lib/importers/nickname";
import { fetchAnilistImportByNickname, parseAnilistExport } from "@/lib/importers/anilist";
import { parseMalExport } from "@/lib/importers/mal";
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
  const selectedIndices = Array.isArray(body.selectedIndices)
    ? body.selectedIndices.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0)
    : undefined;

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
            const parser = isXml ? parseMalExport : parseAnilistExport;
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
    const message = error instanceof Error ? error.message : "Import failed";
    const status = /invalid|not found|private|rate limited|required|format/i.test(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
