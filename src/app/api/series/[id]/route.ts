import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createChangeBackupIfCooledDown } from "@/lib/backup-service";
import {
  deleteSeriesWithOperation,
  getSeriesById,
  updateSeriesWithOperation,
} from "@/lib/series-repository";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const found = getSeriesById(id);

  if (!found) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  return NextResponse.json({ data: found });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const payload = await request.json();
    if (typeof payload.coverImageBase64 === "string" && payload.coverImageBase64.trim()) {
      payload.coverImageBlob = Buffer.from(payload.coverImageBase64, "base64");
    }
    const updated = updateSeriesWithOperation(id, payload);

    if (!updated) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    await createChangeBackupIfCooledDown();
    return NextResponse.json({ data: updated.series, meta: { operationId: updated.operationId } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && /metadata source/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = deleteSeriesWithOperation(id);

  if (!deleted) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  await createChangeBackupIfCooledDown();
  return NextResponse.json({ ok: true, meta: { operationId: deleted.operationId } });
}
