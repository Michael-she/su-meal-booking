"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface IncreaseOption {
  code: number;
  amount: string;
}

export default function IncreasePanel({
  label,
  endpoint,
  options,
  pendingMessage,
}: {
  label: string;
  endpoint: string;
  options: IncreaseOption[];
  pendingMessage: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<IncreaseOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const disabled = !!pendingMessage || options.length === 0;

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: selected.code }),
      });
      const body = await r.json();
      if (!r.ok) {
        throw new Error(body.error ?? `Request failed: ${r.status}`);
      }
      setSuccess(body.message ?? "Request submitted.");
      setSelected(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (disabled && !success) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-4 text-sm text-zinc-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-400">
        {pendingMessage
          ? `A request is already pending (${pendingMessage}). Try again once it clears.`
          : `No ${label} increase options currently available.`}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.code}
            type="button"
            onClick={() => setSelected(opt)}
            className={`rounded border px-3 py-1.5 text-sm ${
              selected?.code === opt.code
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-black/15 text-zinc-800 hover:bg-zinc-50 dark:border-white/20 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {opt.amount}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-amber-700 dark:text-amber-400">
            Request a {selected.amount} {label} increase? This is a real, ~10-minute-cooldown
            request against your account and doesn&apos;t apply instantly.
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(null)}
            disabled={submitting}
            className="rounded border border-black/15 px-3 py-1.5 dark:border-white/20"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {success}
        </div>
      )}
    </div>
  );
}
