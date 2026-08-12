"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyMenu } from "@/lib/menuStore";

export default function MenuUploadPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WeeklyMenu | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  async function handleParse() {
    if (!file) return;
    setStatus("parsing");
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const r = await fetch("/api/menu/parse", { method: "POST", body: form });
      const body = await r.json();
      if (!r.ok) {
        throw new Error(body.error ?? `Request failed: ${r.status}`);
      }
      setResult(body as WeeklyMenu);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const selectClass =
    "w-full rounded border border-black/15 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/20 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Menu photo or scan</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className={selectClass}
          />
        </label>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected menu preview"
            className="mt-3 max-h-80 rounded border border-black/10 object-contain dark:border-white/10"
          />
        )}

        <button
          type="button"
          onClick={handleParse}
          disabled={!file || status === "parsing"}
          className="mt-3 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {status === "parsing" ? "Reading menu..." : "Parse & Save"}
        </button>

        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {result && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            Saved: {result.facility} — {result.weekLabel} ({result.startDate} to {result.endDate})
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="px-2 py-1 font-medium">Day</th>
                  <th className="px-2 py-1 font-medium">Breakfast</th>
                  <th className="px-2 py-1 font-medium">Lunch</th>
                  <th className="px-2 py-1 font-medium">Dinner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {result.days.map((day) => (
                  <tr key={day.date} className="align-top">
                    <td className="px-2 py-1 font-medium text-zinc-900 dark:text-zinc-100">
                      {day.dayName}
                      <br />
                      <span className="text-zinc-500 dark:text-zinc-400">{day.date}</span>
                    </td>
                    <td className="px-2 py-1">{day.meals.breakfast.join(", ") || "—"}</td>
                    <td className="px-2 py-1">{day.meals.lunch.join(", ") || "—"}</td>
                    <td className="px-2 py-1">{day.meals.dinner.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
