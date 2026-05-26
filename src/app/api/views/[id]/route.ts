import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { deleteSavedView, updateSavedView } from "@/lib/views-service";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const payload = await request.json();
    const data = updateSavedView(id, payload);

    if (!data) {
      return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof Error && /already exists/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const deleted = deleteSavedView(id);

  if (!deleted) {
    return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
