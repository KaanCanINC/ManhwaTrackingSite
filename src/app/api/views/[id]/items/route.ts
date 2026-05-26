import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { addCollectionItem, addCollectionItems, removeCollectionItem } from "@/lib/views-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  seriesId: z.string().trim().min(1),
});

const bulkPayloadSchema = z.object({
  seriesIds: z.array(z.string().trim().min(1)).min(1),
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const raw = (await request.json()) as unknown;

    if (
      typeof raw === "object" &&
      raw !== null &&
      "seriesIds" in raw
    ) {
      const payload = bulkPayloadSchema.parse(raw);
      const data = addCollectionItems(id, payload.seriesIds);
      return NextResponse.json({ data }, { status: 201 });
    }

    const payload = payloadSchema.parse(raw);
    const data = addCollectionItem(id, payload.seriesId);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      /not found/i.test(message)
        ? 404
        : /not a collection/i.test(message)
          ? 409
          : /unique|constraint/i.test(message)
            ? 409
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const payload = payloadSchema.parse(await request.json());
    const deleted = removeCollectionItem(id, payload.seriesId);

    if (!deleted) {
      return NextResponse.json({ error: "Collection item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
