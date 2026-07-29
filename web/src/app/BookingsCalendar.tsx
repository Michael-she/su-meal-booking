"use client";

import { useMemo, useState } from "react";
import type { Booking } from "@/lib/suMealClient";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function BookingsCalendar({ bookings }: { bookings: Booking[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const key = b.start.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [bookings]);

  const initial = useMemo(() => {
    if (bookings.length === 0) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() };
    }
    const first = new Date(bookings[0].start);
    return { year: first.getFullYear(), month: first.getMonth() };
  }, [bookings]);

  const [cursor, setCursor] = useState(initial);

  const firstOfMonth = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay();

  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setCursor(({ year, month }) =>
              month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
            )
          }
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="font-medium text-zinc-950 dark:text-zinc-50">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </div>
        <button
          type="button"
          onClick={() =>
            setCursor(({ year, month }) =>
              month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
            )
          }
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="min-h-20 rounded" />;
          }
          const key = dateKey(cursor.year, cursor.month, day);
          const dayBookings = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-20 rounded border p-1 text-left align-top ${
                isToday
                  ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950"
                  : "border-black/5 dark:border-white/10"
              }`}
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{day}</div>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayBookings.map((b, j) => (
                  <div
                    key={j}
                    title={`${b.description} (${b.mealCost})`}
                    className="truncate rounded bg-emerald-100 px-1 py-0.5 text-[11px] text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                  >
                    {b.start.slice(11, 16)} {b.description}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
