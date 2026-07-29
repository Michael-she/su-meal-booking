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

**Credentials are never hardcoded or logged.** The Python client reads a
local two-line `credentials.txt` (gitignored); the web app reads
`SU_USERNAME` / `SU_PASSWORD` from `web/.env.local` (also gitignored).

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

[`start-app.ps1`](start-app.ps1) starts the dev server and opens the
dashboard in your browser once it's ready. A Desktop shortcut can point
`powershell.exe -NoExit -ExecutionPolicy Bypass -File start-app.ps1` at it —
see the script for the exact invocation.

## Security notes

- `credentials.txt`, `web/.env.local`, and `web/data/` (your saved weekly
  pattern) are all gitignored — never commit real credentials or personal
  booking data.
- The web app currently supports a single hardcoded user (read from env
  vars), but every internal function is already keyed by `userId` — see
  [`web/src/lib/credentials.ts`](web/src/lib/credentials.ts) and
  [`web/src/lib/session.ts`](web/src/lib/session.ts) — so swapping in a real
  multi-user login later doesn't require touching route or UI code.
- Write actions (booking a meal, requesting a quota/COB increase, applying a
  weekly pattern) all have an explicit confirm step in the UI, since they're
  real, irreversible actions against a real account.

## Open items

- `cancel-meal-booking` isn't wired up in either client yet.
- The Python client only supports `increase_quota`, not `increase_cob` —
  only the TypeScript client has both.
- CAS failure classification (bad credentials vs. a possible MFA redirect)
  in the TypeScript client is a best-effort heuristic, unverified against a
  real failure response.
