import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const slot = searchParams.get("slot");
    if (!date || !slot) {
      return NextResponse.json({ error: "Missing date or slot" }, { status: 400 });
    }
    const client = await getClientForUser(getCurrentUserId());
    const facilities = await client.getMealFacilities(date, slot);
    return NextResponse.json(facilities);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
