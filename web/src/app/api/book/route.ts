import { NextResponse } from "next/server";
import { getClientForUser, getCurrentUserId } from "@/lib/session";
import type { BookMealInput } from "@/lib/suMealClient";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<BookMealInput>;
    const { mealDate, mealSlot, mealFacility, mealOption, mealSession } = input;
    if (!mealDate || !mealSlot || !mealFacility || !mealOption || mealSession === undefined) {
      return NextResponse.json(
        { error: "Missing one of mealDate, mealSlot, mealFacility, mealOption, mealSession" },
        { status: 400 }
      );
    }
    const client = await getClientForUser(getCurrentUserId());
    const result = await client.bookMeal({
      mealDate,
      mealSlot,
      mealFacility,
      mealOption,
      mealSession,
      excludeWeekends: input.excludeWeekends,
      advanceBookingDays: input.advanceBookingDays,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
