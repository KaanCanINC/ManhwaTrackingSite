import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createSavedView, listSavedViews } from "@/lib/views-service";

export const runtime = "nodejs";

export async function GET() {
  const data = listSavedViews();
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const data = createSavedView(payload);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof Error && /already exists/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && /foreign key/i.test(error.message)) {
      return NextResponse.json({ error: "One or more series IDs are invalid" }, { status: 400 });
    }

    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
