import { NextResponse } from "next/server";
import { deleteBackupById } from "@/lib/backup-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const deleted = await deleteBackupById(id);

  if (!deleted) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
