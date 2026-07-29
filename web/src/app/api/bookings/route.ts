import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate =
      searchParams.get("from") ?? new Date().toISOString().slice(0, 10);

    const client = await getClientForUser(getCurrentUserId());
    const bookings = await client.getBookings(fromDate);
    return NextResponse.json(bookings);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
