import fs from "node:fs/promises";
import path from "node:path";
import type { Booking } from "./suMealClient";

// One level up, outside web/ — this is rewritten on every dashboard load, and
// writing inside web/ puts it under the Next.js dev server's file watcher,
// which triggers a full-page reload on every write (an infinite reload loop,
// visible as the loading state flashing constantly).
const DATA_DIR = path.join(process.cwd(), "..", "data");

function historyFilePath(userId: string): string {
  return path.join(DATA_DIR, `booking-history-${userId}.json`);
}

function bookingKey(b: Booking): string {
  return `${b.start}|${b.description}|${b.mealCost}`;
}

async function readHistory(userId: string): Promise<Booking[]> {
  try {
    const raw = await fs.readFile(historyFilePath(userId), "utf-8");
    return JSON.parse(raw) as Booking[];
  } catch {
    return [];
  }
}

/**
 * The SU API's get-meal-bookings-dto endpoint only ever returns *upcoming*
 * bookings from a given date onward (confirmed against real traffic — see
 * ../../../README.md) — there is no backend endpoint for past bookings. So
 * this is the only way to build up history: every dashboard load snapshots
 * whatever "upcoming" bookings the API just returned and merges them into a
 * local log, keyed by (start, description, mealCost). Once a booking's date
 * passes, the API stops returning it, but it stays in this log. That means
 * history only accumulates from whenever this store was first written —
 * meals booked before this feature existed can't be recovered.
 */
export async function recordAndGetAllBookings(
  userId: string,
  freshlyFetched: Booking[]
): Promise<Booking[]> {
  const existing = await readHistory(userId);
  const byKey = new Map(existing.map((b) => [bookingKey(b), b]));
  for (const b of freshlyFetched) {
    byKey.set(bookingKey(b), b);
  }
  const merged = Array.from(byKey.values()).sort((a, b) => a.start.localeCompare(b.start));

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(historyFilePath(userId), JSON.stringify(merged, null, 2), "utf-8");

  return merged;
}
