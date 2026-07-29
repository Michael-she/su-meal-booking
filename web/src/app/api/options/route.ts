import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const slot = searchParams.get("slot");
    const facility = searchParams.get("facility");
    if (!date || !slot || !facility) {
      return NextResponse.json(
        { error: "Missing date, slot, or facility" },
        { status: 400 }
      );
    }
    const client = await getClientForUser(getCurrentUserId());
    const options = await client.getMealOptions(date, slot, facility);
    return NextResponse.json(options);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
