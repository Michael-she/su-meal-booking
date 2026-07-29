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

Open http://localhost:3000.

## Architecture

- **`src/lib/suMealClient.ts`** — the CAS login (fetch + cheerio for scraping
  the login form, `tough-cookie`/`fetch-cookie` for a real cross-domain
  cookie jar) and every API method. Handles concurrent-call login races
  (two simultaneous requests won't trigger two logins) and re-authenticates
  once on a 401/403 before giving up.
- **`src/lib/credentials.ts`** / **`src/lib/session.ts`** — the multi-user
  seam. Everything is keyed by `userId`, currently hardcoded to `"default"`
  and backed by env vars. Swapping in real per-user login later only means
  changing `getCurrentUserId()` and `getCredentialsForUser()`.
- **`src/lib/patternStore.ts`** — reads/writes the saved weekly booking
  pattern as JSON under `data/` (gitignored, per-user runtime data).
- **`src/app/api/*`** — route handlers: `quota`, `bookings`, `meal-slots`,
  `facilities`, `options`, `book`, `quota/increase`, `cob/increase`,
  `pattern`. All server-side only — the browser never sees the SU
  credentials or session cookie.
- **`src/app/page.tsx`** — the dashboard itself, a Server Component that
  calls the lib functions directly (no self-fetch over HTTP) for the
  read-only parts, passing data down to client components for anything
  interactive.

## Features

- Quota / balance / COB summary, with the shared pending-request state
  surfaced (a pending quota **or** COB request blocks both for ~10 minutes).
- Upcoming bookings shown as a navigable month calendar.
- Book a meal: cascading date → slot → facility → option picker, with a
  confirm step before submitting (it's a real charge).
- Request a quota or COB increase, driven by whatever amounts the account
  actually offers, with a confirm step.
- Weekly pattern: save a recurring (day-of-week, slot, facility, menu-item
  description) template, then "preview" it against any real week — since
  menu-item codes change every day, entries are matched by description at
  apply time, not a stored code — and book whichever rows resolved cleanly.

## Known gaps

- CAS failure classification (`CasLoginError` in `suMealClient.ts`) is a
  best-effort heuristic based on where the login POST redirects to; no real
  bad-credential or MFA response has been captured to verify it against.
- `cancel-meal-booking` (seen in the real app's JS bundle) isn't wired up.
- Single hardcoded user only — see the multi-user seam above for what
  changing that would take.
