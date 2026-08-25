# SU Meal Booking

Personal automation for a Stellenbosch University student meal booking account
(`web-apps.sun.ac.za/student-meal-booking`). Talks directly to the backend
REST API instead of driving a browser.

There are two things in this repo:

- **[`su_meal_client.py`](su_meal_client.py)** — the original Python client. A single
  `SUMealClient` class wrapping the read/write endpoints, plus a `__main__`
  block that prints a quota summary, upcoming bookings, and a sample
  facility/menu lookup.
- **[`web/`](web/)** — a Next.js dashboard built on top of a TypeScript port of the
  same client, with a browser UI for viewing bookings and quota, booking
  meals, requesting quota/COB increases, and saving a recurring weekly
  booking pattern.

Both talk to the same real API and can be used independently.

## How auth works

The site uses CAS (`sso.sun.ac.za`) for login: fetch the login page, scrape
the `lt`/`execution` hidden ticket fields out of the form, POST them back
along with your username and password, and CAS redirects through to
`web-apps.sun.ac.za`, which sets a `jsessionid` cookie. That cookie is the
only auth needed for subsequent API calls — no session token refresh, no
CSRF header.

No MFA challenge has been observed on this service via a direct POST, but
that isn't guaranteed to hold forever. Both clients raise a clear error if
login completes without a `jsessionid` turning up; the TypeScript client
additionally makes a best-effort (unverified) guess at *why* — see
`CasLoginError` in [`web/src/lib/suMealClient.ts`](web/src/lib/suMealClient.ts).

**Credentials are never hardcoded or logged.** Both clients read the same
local two-line `credentials.txt` at the repo root (gitignored) — username on
line 1, password on line 2. The web app falls back to `SU_USERNAME` /
`SU_PASSWORD` in `web/.env.local` (also gitignored) if `credentials.txt`
isn't present.

There's a second, independent integration: the COB account-balance
dashboard at `coblc2.sun.ac.za:9085` uses the same SU username/password but
a completely separate CAS session — its own CAS host (`sso-prod.sun.ac.za`
instead of `sso.sun.ac.za`), its own service URL, and a `SPACEPORT` cookie
instead of `jsessionid`. See `CobClient` in
[`web/src/lib/cobClient.ts`](web/src/lib/cobClient.ts).

Separately from all of the above, the **web dashboard itself** sits behind
its own login screen (`web/src/app/login/`), unrelated to SU's CAS — this
just gates access to the dashboard app, checked by `web/src/proxy.ts`
middleware against an HMAC session cookie (`web/src/lib/appAuth.ts`). It
checks credentials from `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` in
`web/.env.local` if set — but the login page also always offers a
"Continue with default account" button that skips the check entirely, so
this gate is a convenience screen, not a real access control.

## Known API endpoints

All confirmed against real traffic/responses, not guessed — see inline
docstrings/comments in `su_meal_client.py` and `suMealClient.ts` for the
shapes and caveats.

| Endpoint | Method | Notes |
|---|---|---|
| `get-meal-bookings-dto/{lang}/{date}` | GET | Upcoming bookings from `date` onward |
| `get-quota-summary/{lang}` | GET | Quota, balance, COB, and the current increase/decrease options |
| `get-meal-slots-dto/{date}/{lang}` | GET | Available slots (Breakfast/Lunch/Dinner) for a date — excludes already-booked slots |
| `get-meal-slot-facilities/{lang}/{date}/{slot}` | GET | Dining halls open for that date + slot |
| `get-meal-slot-facility-options/{lang}/{date}/{slot}/{facility}` | GET | Menu items for that date + slot + facility (**codes are date-specific** — the same dish gets a different code every day) |
| `store-meal-booking/en` | POST | Book a meal |
| `increase-quota/{lang}/{amountCents}` | GET | Request a quota top-up. Async — returns success immediately but the balance updates later, and a pending request blocks further quota **and** COB requests for ~10 minutes |
| `increase-cob/{lang}/{amountCents}` | GET | Same as above but for COB (carry-over balance). Endpoint confirmed by reading the real app's own `js/services/dataService.js`, not guessed |
| `cancel-meal-booking/{lang}/{bookingId}` | GET | Seen in the real app's source; not wired up in either client yet |

On the separate `coblc2.sun.ac.za:9085` COB dashboard (own CAS session — see above):

| Endpoint | Method | Notes |
|---|---|---|
| `php/plugin/launchpadaccounts/accounts2` | POST | Body `{}`. Returns a JSON array of `{name, balance (cents), hash, primary}` — confirmed against a real response, one entry per real account |

## Setup

### Python client

```bash
pip install requests beautifulsoup4
cp credentials.example.txt credentials.txt   # then fill in your real username/password
python su_meal_client.py
```

### Web dashboard

```bash
cd web
npm install
cp .env.local.example .env.local   # then fill in your real username/password
npm run dev
```

Open http://localhost:3000. See [`web/README.md`](web/README.md) for the
app's architecture and feature list.

### Desktop shortcut (Windows)

Two launchers, both of which start the app and open it in your browser once
it's ready:

| Script | Mode | Port | Use for |
| --- | --- | --- | --- |
| [`start-dashboard.ps1`](start-dashboard.ps1) | production (`next start`) | 3000 | everyday use |
| [`start-app.ps1`](start-app.ps1) | dev server (`next dev`) | 3000 | making changes |

Both use port 3000, so only run one at a time — with the dev server up, the
shortcut sees the port answering and just opens the browser onto *that*
instead of starting the built app.

The **SU Meal Booking** Desktop shortcut points at `start-dashboard.ps1`
(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File start-dashboard.ps1`).

It **does not build** — it runs whatever is already in `web/.next`, so a launch
takes about two seconds. After changing the source, rebuild once by hand:

```bash
cd web
npm run build
```

If there is no build yet the launcher says so and points at that command
rather than starting a server that would serve nothing. If the dashboard is
already running it opens the browser instead of failing on the busy port. The
server runs in the launcher's own window; closing it (or Ctrl+C) stops it.

## Security notes

- `credentials.txt`, `web/.env.local`, and `data/` (your saved weekly
  pattern, booking history, and saved menus) are all gitignored — never
  commit real credentials or personal booking data. `data/` lives at the
  repo root, not under `web/`, so writing to it doesn't sit inside the
  Next.js dev server's watched directory (see `web/src/lib/bookingHistoryStore.ts`).
- The web app currently supports a single hardcoded user (read from env
  vars), but every internal function is already keyed by `userId` — see
  [`web/src/lib/credentials.ts`](web/src/lib/credentials.ts) and
  [`web/src/lib/session.ts`](web/src/lib/session.ts) — so swapping in a real
  multi-user login later doesn't require touching route or UI code.
- Write actions (booking a meal, requesting a quota/COB increase, applying a
  weekly pattern) all have an explicit confirm step in the UI, since they're
  real, irreversible actions against a real account.
- The dashboard's own login screen (see above) is not a real access
  control — its bypass button always grants a session — and
  `AUTH_SECRET`/`DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` default to
  insecure dev values if unset. Don't expose the dashboard to the open
  internet as-is; it's meant to sit behind something you already trust
  (localhost, a private network, or your own reverse-proxy auth).

## Open items

- `cancel-meal-booking` isn't wired up in either client yet.
- The Python client only supports `increase_quota`, not `increase_cob` —
  only the TypeScript client has both.
- CAS failure classification (bad credentials vs. a possible MFA redirect)
  in the TypeScript client is a best-effort heuristic, unverified against a
  real failure response.
