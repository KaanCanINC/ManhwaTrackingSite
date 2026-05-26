import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createGoal, listGoals } from "@/lib/goals-service";

export const runtime = "nodejs";

export async function GET() {
  const data = listGoals();
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const data = createGoal(payload);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      return NextResponse.json(
        { error: "Goal already exists for this period and metric" },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
