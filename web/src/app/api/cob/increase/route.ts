import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { amountCents } = (await request.json()) as { amountCents?: number };
    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ error: "Missing or invalid amountCents" }, { status: 400 });
    }
    const client = await getClientForUser(getCurrentUserId());
    const result = await client.increaseCob(amountCents);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
