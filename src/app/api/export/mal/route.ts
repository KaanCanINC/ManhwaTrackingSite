import { NextResponse } from "next/server";
import { exportMalCompatibleXml } from "@/lib/exporters";

export const runtime = "nodejs";

export async function GET() {
  const xml = exportMalCompatibleXml();
  const fileName = `mal-export-${Date.now()}.xml`;
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
