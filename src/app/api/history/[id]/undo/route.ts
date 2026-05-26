import { NextResponse } from "next/server";
import { createChangeBackupIfCooledDown } from "@/lib/backup-service";
import { undoOperationById } from "@/lib/operation-history";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json(
      { error: "Undo requires explicit confirmation" },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const data = undoOperationById(id);
    await createChangeBackupIfCooledDown();
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Undo failed";
    const status =
      message === "Operation not found"
        ? 404
        : /already undone|cannot be undone|changed after operation|invalid|unsupported/i.test(message)
          ? 409
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
