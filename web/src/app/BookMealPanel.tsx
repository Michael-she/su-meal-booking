"use client";

import { useEffect, useRef, useState } from "react";
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

  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);

  // Changing an "upstream" field (date → slot → facility) kicks off exactly
  // one sequential, awaited fetch chain per change, guarded by a shared
  // generation counter: before any fetch result is applied, we check that no
  // newer change has started since — a slow or reordered response from a
  // superseded chain is discarded instead of clobbering more recent state.
  // Each level tries to restore the previously selected value once its fresh
  // list arrives, and only clears it (and everything downstream) if that
  // value is no longer valid for the new upstream choice. Mirrors
  // WeeklyPatternPanel's cascade, which this was copied from.
  const cascadeGenRef = useRef(0);

  async function runOptionCascade(
    forDate: string,
    slotCode: string,
    facilityCode: string,
    gen: number,
    restoreDescription: string | null
  ) {
    if (!facilityCode) {
      if (cascadeGenRef.current !== gen) return;
      setOptions([]);
      setOptionCode("");
      return;
    }
    setOptionStep("loading");
    setOptionError(null);
    try {
      const data = await fetchJson<MealOption[]>(
        `/api/options?date=${forDate}&slot=${slotCode}&facility=${facilityCode}`
      );
      if (cascadeGenRef.current !== gen) return;
      const filtered = data.filter((o) => o.code !== "0");
      setOptions(filtered);
      setOptionStep("idle");
      // Option (menu item) codes are date-specific — the same dish gets a
      // different code every day — so match the previous selection by
      // description instead.
      const restored = restoreDescription
        ? filtered.find(
            (o) => o.bookable && o.description.toLowerCase() === restoreDescription.toLowerCase()
          )
        : undefined;
      setOptionCode(restored?.code ?? "");
    } catch (err) {
      if (cascadeGenRef.current !== gen) return;
      setOptionError(err instanceof Error ? err.message : String(err));
      setOptionStep("error");
    }
  }

  async function runFacilityCascade(
    forDate: string,
    slotCode: string,
    gen: number,
    restoreFacility: string | null,
    restoreOptionDescription: string | null
  ) {
    setFacilityStep("loading");
    setFacilityError(null);
    try {
      const data = await fetchJson<Facility[]>(`/api/facilities?date=${forDate}&slot=${slotCode}`);
      if (cascadeGenRef.current !== gen) return;
      const filtered = data.filter((f) => f.code !== "0");
      setFacilities(filtered);
      setFacilityStep("idle");
      const finalFacility =
        restoreFacility && filtered.some((f) => f.code === restoreFacility) ? restoreFacility : "";
      setFacility(finalFacility);
      await runOptionCascade(forDate, slotCode, finalFacility, gen, restoreOptionDescription);
    } catch (err) {
      if (cascadeGenRef.current !== gen) return;
      setFacilityError(err instanceof Error ? err.message : String(err));
      setFacilityStep("error");
      setOptions([]);
      setOptionCode("");
    }
  }

  async function runDateCascade(
    forDate: string,
    gen: number,
    restoreSlot: string | null,
    restoreFacility: string | null,
    restoreOptionDescription: string | null
  ) {
    setSlotStep("loading");
    setSlotError(null);
    try {
      const data = await fetchJson<Facility[]>(`/api/meal-slots?date=${forDate}`);
      if (cascadeGenRef.current !== gen) return;
      const filtered = data.filter((s) => s.code !== "0");
      setSlots(filtered);
      setSlotStep("idle");
      const finalSlot = restoreSlot && filtered.some((s) => s.code === restoreSlot) ? restoreSlot : "";
      setSlot(finalSlot);
      if (!finalSlot) {
        setFacilities([]);
        setFacility("");
        setOptions([]);
        setOptionCode("");
        return;
      }
      await runFacilityCascade(forDate, finalSlot, gen, restoreFacility, restoreOptionDescription);
    } catch (err) {
      if (cascadeGenRef.current !== gen) return;
      setSlotError(err instanceof Error ? err.message : String(err));
      setSlotStep("error");
      setFacilities([]);
      setFacility("");
      setOptions([]);
      setOptionCode("");
    }
  }

  useEffect(() => {
    void runDateCascade(today, ++cascadeGenRef.current, null, null, null);
    // Fetches the initial date's options once on mount; every later change
    // goes through the imperative handlers below instead of a reactive effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDateChange(value: string) {
    const gen = ++cascadeGenRef.current;
    const restoreSlot = slot || null;
    const restoreFacility = facility || null;
    const restoreOptionDescription = options.find((o) => o.code === optionCode)?.description ?? null;
    setDate(value);
    setBookSuccess(null);
    setBookError(null);
    void runDateCascade(value, gen, restoreSlot, restoreFacility, restoreOptionDescription);
  }

  function handleSlotChange(value: string) {
    const gen = ++cascadeGenRef.current;
    setSlot(value);
    if (!value) {
      setFacilities([]);
      setFacility("");
      setOptions([]);
      setOptionCode("");
      return;
    }
    const restoreFacility = facility || null;
    const restoreOptionDescription = options.find((o) => o.code === optionCode)?.description ?? null;
    void runFacilityCascade(date, value, gen, restoreFacility, restoreOptionDescription);
  }

  function handleFacilityChange(value: string) {
    const gen = ++cascadeGenRef.current;
    setFacility(value);
    const restoreOptionDescription = options.find((o) => o.code === optionCode)?.description ?? null;
    void runOptionCascade(date, slot, value, gen, restoreOptionDescription);
  }

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
            suppressHydrationWarning
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
            suppressHydrationWarning
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
            suppressHydrationWarning
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

          <button
            type="button"
            onClick={submitBooking}
            disabled={!selectedOption.bookable || booking}
            className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {booking ? "Booking..." : "Book this meal"}
          </button>
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
