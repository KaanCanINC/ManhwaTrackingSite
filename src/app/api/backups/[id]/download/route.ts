import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getBackupFileById } from "@/lib/backup-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const backup = await getBackupFileById(id);

  if (!backup) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  const stream = createReadStream(backup.fullPath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backup.fileName}"`,
    },
  });
}
