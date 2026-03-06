import { NextResponse } from "next/server";
import { getSeriesCoverById } from "@/lib/series-repository";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const cover = getSeriesCoverById(id);

  if (!cover) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(cover.blob), {
    headers: {
      "Content-Type": cover.mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
