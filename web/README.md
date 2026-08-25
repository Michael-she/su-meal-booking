# SU Meal Booking — web dashboard

Next.js (App Router, TypeScript, Tailwind) dashboard for the Stellenbosch
University meal booking account. Full auth flow and API client are
reimplemented in TypeScript rather than shelling out to the Python client —
see the root [`../README.md`](../README.md) for the project overview and the
confirmed API endpoints this is built on.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in your real SU_USERNAME / SU_PASSWORD
npm run dev
```

Open http://localhost:3000. You'll land on `/login` first (see "Dashboard
login gate" below) — `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` in
`.env.local` are optional; without them, or if you'd rather skip typing them,
the "Continue with default account" button on that page gets you in.

`npm run dev` runs `next dev --webpack`, not the Turbopack default — see
"Known gaps" below for why.

## Architecture

- **`src/lib/suMealClient.ts`** — the CAS login (fetch + cheerio for scraping
  the login form, `tough-cookie`/`fetch-cookie` for a real cross-domain
  cookie jar) and every API method. Handles concurrent-call login races
  (two simultaneous requests won't trigger two logins) and re-authenticates
  once on a 401/403 before giving up.
- **`src/lib/cobClient.ts`** — a separate client for the independent COB
  account-balance dashboard (`coblc2.sun.ac.za:9085`). Same SU credentials,
  but its own CAS host/session and cookie (`SPACEPORT`, not `jsessionid`) —
  see the root README for details.
- **`src/lib/credentials.ts`** / **`src/lib/session.ts`** — the multi-user
  seam. Everything is keyed by `userId`, currently hardcoded to `"default"`.
  Credentials are read from the repo-root `credentials.txt` (preferred) or
  `web/.env.local` env vars as a fallback. Swapping in real per-user login
  later only means changing `getCurrentUserId()` and `getCredentialsForUser()`.
- **`src/lib/patternStore.ts`** — reads/writes the saved weekly booking
  pattern as JSON under the repo-root `data/` (gitignored, per-user runtime
  data — deliberately *not* under `web/`, since the Next.js dev server
  watches everything inside `web/` and a write there would trigger a
  full-page reload).
- **`src/lib/bookingHistoryStore.ts`** — snapshots each fetch of "upcoming"
  bookings into a local JSON log under the repo-root `data/`, since the SU
  API has no history endpoint (see below). This is how past meals stay
  visible after their date passes.
- **`src/lib/menuVisionClient.ts`** / **`src/lib/menuStore.ts`** — the weekly
  menu photo upload feature: sends an uploaded menu image to Google Gemini
  (`gemini-3.6-flash` via `@google/genai`'s Interactions API, with a JSON
  schema in `response_format` for structured output) to extract a structured
  weekly menu, then saves it as JSON under the repo-root `data/menus/` (one file per
  facility+week, gitignored). Requires `GEMINI_API_KEY` in `web/.env.local`.
- **`src/app/api/*`** — route handlers: `quota`, `bookings`, `meal-slots`,
  `facilities`, `options`, `book`, `quota/increase`, `cob/increase`,
  `pattern`, `menu/parse`. All server-side only — the browser never sees the
  SU credentials or session cookie.
- **`src/proxy.ts`** / **`src/lib/appAuth.ts`** / **`src/app/login/`** — the
  dashboard's own login gate, unrelated to SU's CAS auth above. `proxy.ts` is
  Next's middleware: it redirects any request without a valid session cookie
  to `/login`, and 401s bare API calls the same way. The session cookie is an
  HMAC token (`appAuth.ts`, keyed by `AUTH_SECRET`, falling back to a fixed
  insecure dev value if unset) rather than anything stateful, so both the
  middleware bundle and the login Server Action can validate it independently.
  `login/actions.ts` checks `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` if set,
  but also exposes `bypassLogin()` — a button on the login page that grants a
  session with no check at all — so this gate is a UX nicety, not real access
  control (see Security notes in the root README).
- **`src/app/page.tsx`** — the dashboard itself, a Server Component that
  calls the lib functions directly (no self-fetch over HTTP) for the
  read-only parts, passing data down to client components for anything
  interactive.

## Features

- Dashboard login gate at `/login`, independent of the SU account login —
  see the `proxy.ts`/`appAuth.ts` entry above. Optional username/password via
  env vars, or a one-click "Continue with default account" bypass.
- Quota / balance / COB summary, with the shared pending-request state
  surfaced (a pending quota **or** COB request blocks both for ~10 minutes).
- COB account balance from the separate `coblc2.sun.ac.za:9085` dashboard,
  shown as its own card. Non-blocking: if this login fails, the rest of the
  dashboard still loads.
- Weekly menu upload (`/menu-upload`): upload a photo of the dining hall's
  printed weekly menu, and Google Gemini parses it into a structured menu
  (facility, week, and breakfast/lunch/dinner per day) that's saved locally.
- Bookings shown as a navigable month calendar, with past meals (muted) and
  upcoming ones (highlighted) both visible. Past bookings only go back as far
  as the local history log has been running — the SU API itself only ever
  returns upcoming bookings, so history before that can't be recovered.
- Book a meal: cascading date → slot → facility → option picker. Changing an
  upstream field (date, then slot, then facility) tries to restore the
  previously selected downstream values once the new list loads, same
  cascade/restore logic as the weekly pattern builder below. No confirm step
  before submitting — booking is immediate.
- Request a quota or COB increase, driven by whatever amounts the account
  actually offers, with a confirm step.
- Weekly pattern: save a recurring (day-of-week, slot, facility, menu-item
  description) template, then "preview" it against any real week — since
  menu-item codes change every day, entries are matched by description at
  apply time, not a stored code — and book whichever rows resolved cleanly.
  The builder's date → slot → facility → option picker uses the same
  restore-on-change cascade as "Book a meal". Saved entries are always shown
  (and resolved against a week) in the order they actually occur — Monday
  breakfast through Sunday dinner — not the order they were added in.

## Known gaps

- `next build` runs on Turbopack by default in v16 and hard-errors if a
  `webpack` config is present without a `turbopack` one. The webpack block in
  `next.config.ts` is dev-only, so `turbopack: {}` is set to say Turbopack
  needs no customisation — production builds use it, `next dev --webpack`
  keeps the watchOptions fix.
- CAS failure classification (`CasLoginError` in `suMealClient.ts`) is a
  best-effort heuristic based on where the login POST redirects to; no real
  bad-credential or MFA response has been captured to verify it against.
- `cancel-meal-booking` (seen in the real app's JS bundle) isn't wired up.
- Single hardcoded user only — see the multi-user seam above for what
  changing that would take.
- **Turbopack dev + Firefox: reload loop.** `next dev` (Turbopack, the v16
  default) reload-loops in Firefox specifically — the first load of a page is
  fine, but any reload after that immediately hits a `ChunkLoadError` (a
  `<script>` for a `[turbopack]_browser_dev_hmr-client...js` chunk 404s) and
  the dev overlay's "stale build, reload to recover" logic fires, which hits
  the same broken chunk again: an infinite loop. Reproduces in a fresh
  Firefox profile and a fresh Private Window (so it isn't cached state,
  cookies, or an extension), and does not reproduce in Chromium. Root cause
  not fully identified — looks like a Turbopack dev-asset-server /
  Firefox-networking interaction specific to this Next.js version (16.2.11).
  Worked around, not fixed, by running dev under Webpack instead
  (`next dev --webpack`, wired up as the `dev` script in `package.json`) —
  if you need to test Turbopack-specific behavior, swap that flag back
  and expect this loop in Firefox.
- **Separate, unrelated bug already fixed**: earlier, a full-page reload
  loop was traced to Next's dev logging (`logging.*` in `next.config.ts`)
  writing to `.next/dev/logs/next-development.log`, a file inside the dev
  server's own watched directory — every write (browser-console-forwarded
  messages, but also Next's own request/compile logs) triggered a Fast
  Refresh reload, which produced more log writes, which triggered another
  reload. Fixed by setting `logging: false` outright (partial suppression,
  e.g. just `browserToTerminal: false`, wasn't enough — server-side request
  logs still got written and still triggered the loop). If dev logging is
  ever turned back on, watch for this loop returning.
