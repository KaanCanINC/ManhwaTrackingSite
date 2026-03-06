import fs from "node:fs";
import { NextResponse } from "next/server";
import { getBackupFileById } from "@/lib/backup-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const backup = getBackupFileById(id);

  if (!backup) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  const data = fs.readFileSync(backup.fullPath, "utf8");
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backup.fileName}"`,
    },
  });
}
