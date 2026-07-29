import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getPatternForUser, savePatternForUser, type PatternEntry } from "@/lib/patternStore";

export async function GET() {
  const pattern = await getPatternForUser(getCurrentUserId());
  return NextResponse.json(pattern);
}

export async function PUT(request: Request) {
  try {
    const pattern = (await request.json()) as PatternEntry[];
    if (!Array.isArray(pattern)) {
      return NextResponse.json({ error: "Expected an array" }, { status: 400 });
    }
    await savePatternForUser(getCurrentUserId(), pattern);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
