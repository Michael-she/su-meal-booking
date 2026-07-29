"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Facility, MealOption } from "@/lib/suMealClient";

type Step = "idle" | "loading" | "error";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) {
    throw new Error(body.error ?? `Request failed: ${r.status}`);
  }
  return body as T;
}

/**
 * `today` comes from the server component's render (a single "now"), rather
 * than each client component calling `new Date()` itself — otherwise SSR and
 * client hydration can disagree (different moment, different timezone) and
 * React logs a hydration mismatch on the date input's initial value.
 */
export default function BookMealPanel({ today }: { today: string }) {
  const router = useRouter();

  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Facility[]>([]);
  const [slotStep, setSlotStep] = useState<Step>("idle");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState("");

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityStep, setFacilityStep] = useState<Step>("idle");
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [facility, setFacility] = useState("");

  const [options, setOptions] = useState<MealOption[]>([]);
  const [optionStep, setOptionStep] = useState<Step>("idle");
  const [optionError, setOptionError] = useState<string | null>(null);
  const [optionCode, setOptionCode] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);

  function handleDateChange(value: string) {
    setDate(value);
    setSlot("");
    setFacilities([]);
    setFacility("");
    setOptions([]);
    setOptionCode("");
    setBookSuccess(null);
    setBookError(null);
  }

  function handleSlotChange(value: string) {
    setSlot(value);
    setFacility("");
    setOptions([]);
    setOptionCode("");
  }

  function handleFacilityChange(value: string) {
    setFacility(value);
    setOptionCode("");
  }

  // Fetch slots whenever the date changes (resetting downstream selections
  // happens in handleDateChange, not here, so this effect only synchronizes
  // with the API rather than also resetting sibling state). The "loading"
  // flag is set inside a .then() rather than directly in the effect body —
  // react-hooks/set-state-in-effect flags synchronous setState calls in an
  // effect, so the update is deferred a microtask via Promise.resolve().
  useEffect(() => {
    if (!date) return;

    Promise.resolve()
      .then(() => {
        setSlotStep("loading");
        setSlotError(null);
        return fetchJson<Facility[]>(`/api/meal-slots?date=${date}`);
      })
      .then((data) => {
        setSlots(data.filter((s) => s.code !== "0"));
        setSlotStep("idle");
      })
      .catch((err) => {
        setSlotError(err instanceof Error ? err.message : String(err));
        setSlotStep("error");
      });
  }, [date]);

  // Fetch facilities whenever the slot changes.
  useEffect(() => {
    if (!date || !slot) return;

    Promise.resolve()
      .then(() => {
        setFacilityStep("loading");
        setFacilityError(null);
        return fetchJson<Facility[]>(`/api/facilities?date=${date}&slot=${slot}`);
      })
      .then((data) => {
        setFacilities(data.filter((f) => f.code !== "0"));
        setFacilityStep("idle");
      })
      .catch((err) => {
        setFacilityError(err instanceof Error ? err.message : String(err));
        setFacilityStep("error");
      });
  }, [date, slot]);

  // Fetch options whenever the facility changes.
  useEffect(() => {
    if (!date || !slot || !facility) return;

    Promise.resolve()
      .then(() => {
        setOptionStep("loading");
        setOptionError(null);
        return fetchJson<MealOption[]>(
          `/api/options?date=${date}&slot=${slot}&facility=${facility}`
        );
      })
      .then((data) => {
        setOptions(data.filter((o) => o.code !== "0"));
        setOptionStep("idle");
      })
      .catch((err) => {
        setOptionError(err instanceof Error ? err.message : String(err));
        setOptionStep("error");
      });
  }, [date, slot, facility]);

  const selectedOption = options.find((o) => o.code === optionCode) ?? null;
  const selectedSlotDesc = slots.find((s) => s.code === slot)?.description ?? slot;
  const selectedFacilityDesc =
    facilities.find((f) => f.code === facility)?.description ?? facility;

  async function submitBooking() {
    if (!selectedOption) return;
    setBooking(true);
    setBookError(null);
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealDate: date,
          mealSlot: slot,
          mealFacility: facility,
          mealOption: selectedOption.code,
          mealSession: selectedOption.sessionId,
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        throw new Error(body.error ?? `Booking failed: ${r.status}`);
      }
      setBookSuccess(body.message ?? "Booking submitted.");
      setConfirming(false);
      setOptionCode("");
      router.refresh();
    } catch (err) {
      setBookError(err instanceof Error ? err.message : String(err));
    } finally {
      setBooking(false);
    }
  }

  const selectClass =
    "w-full rounded border border-black/15 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/20 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className={selectClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Meal</span>
          <select
            value={slot}
            onChange={(e) => handleSlotChange(e.target.value)}
            disabled={slotStep === "loading" || slots.length === 0}
            className={selectClass}
          >
            <option value="">
              {slotStep === "loading" ? "Loading..." : "Select"}
            </option>
            {slots.map((s) => (
              <option key={s.code} value={s.code}>
                {s.description}
              </option>
            ))}
          </select>
          {slotError && <span className="text-xs text-red-600 dark:text-red-400">{slotError}</span>}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Facility</span>
          <select
            value={facility}
            onChange={(e) => handleFacilityChange(e.target.value)}
            disabled={!slot || facilityStep === "loading" || facilities.length === 0}
            className={selectClass}
          >
            <option value="">
              {facilityStep === "loading" ? "Loading..." : "Select"}
            </option>
            {facilities.map((f) => (
              <option key={f.code} value={f.code}>
                {f.description}
              </option>
            ))}
          </select>
          {facilityError && (
            <span className="text-xs text-red-600 dark:text-red-400">{facilityError}</span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Option</span>
          <select
            value={optionCode}
            onChange={(e) => setOptionCode(e.target.value)}
            disabled={!facility || optionStep === "loading" || options.length === 0}
            className={selectClass}
          >
            <option value="">
              {optionStep === "loading" ? "Loading..." : "Select"}
            </option>
            {options.map((o) => (
              <option key={o.code} value={o.code} disabled={!o.bookable}>
                {o.description} ({o.cost ?? "—"})
                {!o.bookable && o.reason ? ` — ${o.reason}` : ""}
              </option>
            ))}
          </select>
          {optionError && (
            <span className="text-xs text-red-600 dark:text-red-400">{optionError}</span>
          )}
        </label>
      </div>

      {selectedOption && (
        <div className="mt-4 rounded border border-black/10 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-zinc-950">
          <div className="text-zinc-900 dark:text-zinc-100">
            <strong>{selectedOption.description}</strong> at {selectedFacilityDesc},{" "}
            {selectedSlotDesc} on {date} ({selectedOption.sessionStart}–
            {selectedOption.sessionEnd}) — {selectedOption.cost}
          </div>

          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!selectedOption.bookable}
              className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Book this meal
            </button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-amber-700 dark:text-amber-400">
                Confirm booking? This submits a real request against your account.
              </span>
              <button
                type="button"
                onClick={submitBooking}
                disabled={booking}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {booking ? "Booking..." : "Yes, book it"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={booking}
                className="rounded border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {bookError && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {bookError}
        </div>
      )}
      {bookSuccess && (
        <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {bookSuccess}
        </div>
      )}
    </div>
  );
}
