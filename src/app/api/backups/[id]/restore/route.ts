import { NextResponse } from "next/server";
import { restoreByBackupId } from "@/lib/backup-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json(
      { error: "Restore requires explicit confirmation" },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const result = await restoreByBackupId(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed";
    const status = message === "Backup not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
