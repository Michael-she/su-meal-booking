"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Facility, MealOption } from "@/lib/suMealClient";
import type { PatternEntry } from "@/lib/patternStore";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) {
    throw new Error(body.error ?? `Request failed: ${r.status}`);
  }
  return body as T;
}

// Pure date-string arithmetic anchored on a fixed `today` (passed down from
// the server component's render) rather than calling `new Date()` for "now"
// inside a component — the latter runs once during SSR and again during
// client hydration, and if those two moments (or timezones) disagree, React
// logs a hydration mismatch on whatever initial state was derived from it.
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekFromIso(dateIso: string): number {
  return new Date(dateIso + "T00:00:00Z").getUTCDay();
}

/** Next date (today counts) that falls on the given day-of-week (0=Sun..6=Sat). */
function nextDateForWeekday(dayOfWeek: number, today: string): string {
  const diff = (dayOfWeek - dayOfWeekFromIso(today) + 7) % 7;
  return addDaysIso(today, diff);
}

function nextMonday(today: string): string {
  const diff = (1 - dayOfWeekFromIso(today) + 7) % 7 || 7;
  return addDaysIso(today, diff);
}

// The week concept elsewhere in this component (nextMonday, "Apply pattern to
// a week") starts on Monday, not Sunday — so entries sort Monday-first too,
// rather than by the raw 0=Sunday..6=Saturday value `dayOfWeek` is stored as.
const MEAL_SLOT_ORDER: Record<string, number> = { B: 0, L: 1, D: 2 };

function compareByWhenTheyOccur(a: PatternEntry, b: PatternEntry): number {
  const dayDiff = ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7);
  if (dayDiff !== 0) return dayDiff;
  return (MEAL_SLOT_ORDER[a.slot] ?? 99) - (MEAL_SLOT_ORDER[b.slot] ?? 99);
}

interface ResolvedRow {
  entry: PatternEntry;
  date: string;
  status: "resolved" | "not-found" | "error";
  option?: MealOption;
  message?: string;
}

export default function WeeklyPatternPanel({
  initialPattern,
  today,
}: {
  initialPattern: PatternEntry[];
  today: string;
}) {
  const router = useRouter();
  const [pattern, setPattern] = useState<PatternEntry[]>(initialPattern);
  // Display/iteration order only — entries are still stored in the order
  // they were added; this just reorders how they're shown and resolved.
  const sortedPattern = [...pattern].sort(compareByWhenTheyOccur);

  // --- Builder state ---
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [slots, setSlots] = useState<Facility[]>([]);
  const [slotStep, setSlotStep] = useState<"idle" | "loading" | "error">("idle");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState("");

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityStep, setFacilityStep] = useState<"idle" | "loading" | "error">("idle");
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [facility, setFacility] = useState("");

  const [options, setOptions] = useState<MealOption[]>([]);
  const [optionStep, setOptionStep] = useState<"idle" | "loading" | "error">("idle");
  const [optionError, setOptionError] = useState<string | null>(null);
  const [optionCode, setOptionCode] = useState("");

  const representativeDate = nextDateForWeekday(dayOfWeek, today);

  // Changing an "upstream" field (day → slot → facility) kicks off exactly
  // one sequential, awaited fetch chain per change, guarded by a shared
  // generation counter: before any fetch result is applied, we check that no
  // newer change has started since — a slow or reordered response from a
  // superseded chain is discarded instead of clobbering more recent state.
  // (Three independent effects reacting to overlapping dependencies used to
  // race here — each fired in the same tick using not-yet-validated upstream
  // values — which is exactly what made this unreliable against the real
  // API's latency.) Each level tries to restore the previously selected
  // value once its fresh list arrives, and only clears it (and everything
  // downstream) if that value is no longer valid for the new upstream choice.
  const cascadeGenRef = useRef(0);

  async function runOptionCascade(
    date: string,
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
        `/api/options?date=${date}&slot=${slotCode}&facility=${facilityCode}`
      );
      if (cascadeGenRef.current !== gen) return;
      const filtered = data.filter((o) => o.code !== "0");
      setOptions(filtered);
      setOptionStep("idle");
      // Unlike slot/facility codes, option (menu item) codes are date-specific
      // — the same dish gets a different code every day — so match the
      // previous selection by description, the same way resolveWeek() below
      // re-matches a saved pattern entry against a given week's actual menu.
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
    date: string,
    slotCode: string,
    gen: number,
    restoreFacility: string | null,
    restoreOptionDescription: string | null
  ) {
    setFacilityStep("loading");
    setFacilityError(null);
    try {
      const data = await fetchJson<Facility[]>(`/api/facilities?date=${date}&slot=${slotCode}`);
      if (cascadeGenRef.current !== gen) return;
      const filtered = data.filter((f) => f.code !== "0");
      setFacilities(filtered);
      setFacilityStep("idle");
      const finalFacility =
        restoreFacility && filtered.some((f) => f.code === restoreFacility) ? restoreFacility : "";
      setFacility(finalFacility);
      await runOptionCascade(date, slotCode, finalFacility, gen, restoreOptionDescription);
    } catch (err) {
      if (cascadeGenRef.current !== gen) return;
      setFacilityError(err instanceof Error ? err.message : String(err));
      setFacilityStep("error");
      setOptions([]);
      setOptionCode("");
    }
  }

  async function runDayCascade(
    date: string,
    gen: number,
    restoreSlot: string | null,
    restoreFacility: string | null,
    restoreOptionDescription: string | null
  ) {
    setSlotStep("loading");
    setSlotError(null);
    try {
      const data = await fetchJson<Facility[]>(`/api/meal-slots?date=${date}`);
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
      await runFacilityCascade(date, finalSlot, gen, restoreFacility, restoreOptionDescription);
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
    void runDayCascade(representativeDate, ++cascadeGenRef.current, null, null, null);
    // Fetches the initial day's options once on mount; every later change
    // goes through the imperative handlers below instead of a reactive effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDayChange(value: number) {
    const gen = ++cascadeGenRef.current;
    const date = nextDateForWeekday(value, today);
    const restoreSlot = slot || null;
    const restoreFacility = facility || null;
    const restoreOptionDescription = options.find((o) => o.code === optionCode)?.description ?? null;
    setDayOfWeek(value);
    void runDayCascade(date, gen, restoreSlot, restoreFacility, restoreOptionDescription);
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
    void runFacilityCascade(representativeDate, value, gen, restoreFacility, restoreOptionDescription);
  }

  function handleFacilityChange(value: string) {
    const gen = ++cascadeGenRef.current;
    setFacility(value);
    const restoreOptionDescription = options.find((o) => o.code === optionCode)?.description ?? null;
    void runOptionCascade(representativeDate, slot, value, gen, restoreOptionDescription);
  }

  async function persistPattern(next: PatternEntry[]) {
    setPattern(next);
    await fetch("/api/pattern", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  function addToPattern() {
    const slotDescription = slots.find((s) => s.code === slot)?.description ?? slot;
    const facilityDescription =
      facilities.find((f) => f.code === facility)?.description ?? facility;
    const option = options.find((o) => o.code === optionCode);
    if (!option) return;

    const entry: PatternEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dayOfWeek,
      slot,
      slotDescription,
      facilityCode: facility,
      facilityDescription,
      optionDescription: option.description,
    };
    void persistPattern([...pattern, entry]);
    setOptionCode("");
  }

  function removeFromPattern(id: string) {
    void persistPattern(pattern.filter((e) => e.id !== id));
  }

  // --- Save / load pattern as a JSON file ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PatternEntry[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function isPatternEntry(x: unknown): x is Omit<PatternEntry, "id"> {
    if (typeof x !== "object" || x === null) return false;
    const e = x as Record<string, unknown>;
    return (
      typeof e.dayOfWeek === "number" &&
      e.dayOfWeek >= 0 &&
      e.dayOfWeek <= 6 &&
      typeof e.slot === "string" &&
      typeof e.slotDescription === "string" &&
      typeof e.facilityCode === "string" &&
      typeof e.facilityDescription === "string" &&
      typeof e.optionDescription === "string"
    );
  }

  function savePatternToFile() {
    const blob = new Blob([JSON.stringify(pattern, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-pattern-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    setImportError(null);
    setPendingImport(null);
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed) || !parsed.every(isPatternEntry)) {
          throw new Error(
            "That file doesn't look like a saved pattern (expected an array of pattern entries)."
          );
        }
        // Fresh ids on import so a hand-edited or older-export file can't
        // collide with entries already in the saved pattern.
        const withFreshIds: PatternEntry[] = parsed.map((entry) => ({
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
        setPendingImport(withFreshIds);
      })
      .catch((err) => {
        setImportError(err instanceof Error ? err.message : "Could not read that file.");
      });
  }

  function confirmImport() {
    if (!pendingImport) return;
    void persistPattern(pendingImport);
    setPendingImport(null);
  }

  function cancelImport() {
    setPendingImport(null);
  }

  // --- Apply-to-week state ---
  const [weekStart, setWeekStart] = useState(nextMonday(today));
  const [resolving, setResolving] = useState(false);
  const [rows, setRows] = useState<ResolvedRow[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirmingApply, setConfirmingApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<Record<string, string> | null>(null);

  function dateForEntry(entryDayOfWeek: number): string {
    const offset = (entryDayOfWeek - dayOfWeekFromIso(weekStart) + 7) % 7;
    return addDaysIso(weekStart, offset);
  }

  async function resolveWeek() {
    setResolving(true);
    setRows(null);
    setApplyResults(null);
    const resolved: ResolvedRow[] = [];
    for (const entry of sortedPattern) {
      const date = dateForEntry(entry.dayOfWeek);
      try {
        const opts = await fetchJson<MealOption[]>(
          `/api/options?date=${date}&slot=${entry.slot}&facility=${entry.facilityCode}`
        );
        const match = opts.find(
          (o) => o.description.toLowerCase() === entry.optionDescription.toLowerCase()
        );
        if (!match) {
          resolved.push({ entry, date, status: "not-found", message: "No matching option this week" });
        } else if (!match.bookable) {
          resolved.push({
            entry,
            date,
            status: "not-found",
            message: match.reason || "Not bookable (likely already booked)",
          });
        } else {
          resolved.push({ entry, date, status: "resolved", option: match });
        }
      } catch (err) {
        resolved.push({
          entry,
          date,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setRows(resolved);
    setChecked(
      Object.fromEntries(resolved.map((r) => [r.entry.id, r.status === "resolved"]))
    );
    setResolving(false);
  }

  async function applySelected() {
    if (!rows) return;
    setApplying(true);
    const results: Record<string, string> = {};
    for (const row of rows) {
      if (!checked[row.entry.id] || row.status !== "resolved" || !row.option) continue;
      try {
        const r = await fetch("/api/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mealDate: row.date,
            mealSlot: row.entry.slot,
            mealFacility: row.entry.facilityCode,
            mealOption: row.option.code,
            mealSession: row.option.sessionId,
          }),
        });
        const body = await r.json();
        results[row.entry.id] = r.ok ? "Booked" : `Failed: ${body.error}`;
      } catch (err) {
        results[row.entry.id] = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    setApplyResults(results);
    setConfirmingApply(false);
    setApplying(false);
    router.refresh();
  }

  const selectClass =
    "w-full rounded border border-black/15 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/20 dark:bg-zinc-950 dark:text-zinc-100";

  const checkedCount = rows ? rows.filter((r) => checked[r.entry.id]).length : 0;
  const checkedTotal = rows
    ? rows
        .filter((r) => checked[r.entry.id] && r.option?.cost)
        .reduce((sum, r) => sum + parseFloat(r.option!.cost!.replace(/[^0-9.]/g, "")), 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add a pattern entry</div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Day of week</span>
            <select
              value={dayOfWeek}
              onChange={(e) => handleDayChange(Number(e.target.value))}
              className={selectClass}
            >
              {WEEKDAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
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
              <option value="">{slotStep === "loading" ? "Loading..." : "Select"}</option>
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
              <option value="">{facilityStep === "loading" ? "Loading..." : "Select"}</option>
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
              <option value="">{optionStep === "loading" ? "Loading..." : "Select"}</option>
              {options.map((o) => (
                <option key={o.code} value={o.code} disabled={!o.bookable}>
                  {o.description} ({o.cost ?? "—"})
                </option>
              ))}
            </select>
            {optionError && (
              <span className="text-xs text-red-600 dark:text-red-400">{optionError}</span>
            )}
          </label>
        </div>
        <button
          type="button"
          onClick={addToPattern}
          disabled={!optionCode}
          className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add to pattern
        </button>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Menu item codes change week to week, so entries are saved by description (e.g.
          &quot;Standard Meal&quot;) and re-matched against that week&apos;s actual menu when applied.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Saved pattern</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={savePatternToFile}
              disabled={pattern.length === 0}
              className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-white/20 dark:hover:bg-zinc-800"
            >
              Save to file
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-white/20 dark:hover:bg-zinc-800"
            >
              Load from file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {importError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{importError}</p>
        )}

        {pendingImport && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Replace the saved pattern ({pattern.length} {pattern.length === 1 ? "entry" : "entries"}) with{" "}
            {pendingImport.length} {pendingImport.length === 1 ? "entry" : "entries"} from the file?
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={confirmImport}
                className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={cancelImport}
                className="rounded border border-black/15 px-3 py-1.5 text-xs dark:border-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pattern.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No pattern entries yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {sortedPattern.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded border border-black/10 px-3 py-1.5 text-sm dark:border-white/10"
              >
                <span>
                  <strong>{WEEKDAY_NAMES[entry.dayOfWeek]}</strong> — {entry.slotDescription} at{" "}
                  {entry.facilityDescription}: {entry.optionDescription}
                </span>
                <button
                  type="button"
                  onClick={() => removeFromPattern(entry.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Apply pattern to a week
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Week starting</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                setWeekStart(e.target.value);
                setRows(null);
                setApplyResults(null);
              }}
              className={selectClass}
            />
          </label>
          <button
            type="button"
            onClick={resolveWeek}
            disabled={pattern.length === 0 || resolving}
            className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-white/20 dark:hover:bg-zinc-800"
          >
            {resolving ? "Checking menu..." : "Preview this week's menu"}
          </button>
        </div>

        {rows && (
          <div className="mt-4">
            <div className="overflow-hidden rounded border border-black/10 dark:border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium"></th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Meal</th>
                    <th className="px-3 py-2 font-medium">Facility</th>
                    <th className="px-3 py-2 font-medium">Option</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {rows.map((row) => (
                    <tr key={row.entry.id} className="bg-white dark:bg-zinc-950">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!checked[row.entry.id]}
                          disabled={row.status !== "resolved"}
                          onChange={(e) =>
                            setChecked((c) => ({ ...c, [row.entry.id]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        {WEEKDAY_NAMES[row.entry.dayOfWeek].slice(0, 3)} {row.date}
                      </td>
                      <td className="px-3 py-2">{row.entry.slotDescription}</td>
                      <td className="px-3 py-2">{row.entry.facilityDescription}</td>
                      <td className="px-3 py-2">{row.entry.optionDescription}</td>
                      <td className="px-3 py-2">{row.option?.cost ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.status === "resolved" ? (
                          applyResults?.[row.entry.id] ? (
                            <span
                              className={
                                applyResults[row.entry.id].startsWith("Booked")
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                              }
                            >
                              {applyResults[row.entry.id]}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                          )
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400">{row.message}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                {checkedCount} selected, ~R{checkedTotal.toFixed(2)} total
              </span>
              {!confirmingApply ? (
                <button
                  type="button"
                  onClick={() => setConfirmingApply(true)}
                  disabled={checkedCount === 0}
                  className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Book selected
                </button>
              ) : (
                <>
                  <span className="text-amber-700 dark:text-amber-400">
                    Book {checkedCount} real meal(s) for ~R{checkedTotal.toFixed(2)}?
                  </span>
                  <button
                    type="button"
                    onClick={applySelected}
                    disabled={applying}
                    className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {applying ? "Booking..." : "Yes, book them"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingApply(false)}
                    disabled={applying}
                    className="rounded border border-black/15 px-3 py-1.5 dark:border-white/20"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
