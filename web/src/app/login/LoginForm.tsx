"use client";

import { useActionState } from "react";
import { login, bypassLogin, type LoginState } from "./actions";

const initialState: LoginState = {};

const inputClass =
  "w-full rounded border border-black/15 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-white/20 dark:bg-zinc-950 dark:text-zinc-100";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Username</span>
          <input name="username" type="text" autoComplete="username" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </label>
        {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
        <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        or
        <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>

      <form action={bypassLogin}>
        <button
          type="submit"
          className="w-full rounded border border-black/15 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/20 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Continue with default account
        </button>
      </form>
    </div>
  );
}
