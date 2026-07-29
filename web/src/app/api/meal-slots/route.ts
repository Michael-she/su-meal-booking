import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }
    const client = await getClientForUser(getCurrentUserId());
    const slots = await client.getMealSlots(date);
    return NextResponse.json(slots);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
