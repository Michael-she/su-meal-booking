import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function GET() {
  try {
    const client = await getClientForUser(getCurrentUserId());
    const quota = await client.getQuotaSummary();
    return NextResponse.json(quota);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
