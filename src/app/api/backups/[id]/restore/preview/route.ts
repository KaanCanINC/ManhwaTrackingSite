import { NextResponse } from "next/server";
import { previewRestoreByBackupId } from "@/lib/backup-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;

  try {
    const preview = previewRestoreByBackupId(id);
    return NextResponse.json({ data: preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore preview failed";
    const status = message === "Backup not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
