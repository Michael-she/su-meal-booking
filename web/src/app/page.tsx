import { getClientForUser, getCurrentUserId } from "@/lib/session";
import { CasLoginError, type Booking, type QuotaSummary } from "@/lib/suMealClient";
import { getPatternForUser } from "@/lib/patternStore";
import BookingsCalendar from "./BookingsCalendar";
import BookMealPanel from "./BookMealPanel";
import IncreasePanel from "./IncreasePanel";
import WeeklyPatternPanel from "./WeeklyPatternPanel";

type DashboardError = {
  message: string;
  kind: "invalid-credentials" | "possible-mfa" | "unknown";
};

async function loadDashboardData(today: string): Promise<
  | { ok: true; quota: QuotaSummary; bookings: Booking[] }
  | { ok: false; error: DashboardError }
> {
  try {
    const client = await getClientForUser(getCurrentUserId());
    const [quota, bookings] = await Promise.all([
      client.getQuotaSummary(),
      client.getBookings(today),
    ]);
    return { ok: true, quota, bookings };
  } catch (err) {
    if (err instanceof CasLoginError) {
      return { ok: false, error: { message: err.message, kind: err.kind } };
    }
    return {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : String(err),
        kind: "unknown",
      },
    };
  }
}

const ERROR_KIND_LABEL: Record<DashboardError["kind"], string> = {
  "invalid-credentials": "Login rejected (likely bad credentials)",
  "possible-mfa": "Unexpected redirect (possibly an MFA challenge)",
  unknown: "Login/request error",
};

function QuotaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </div>
    </div>
  );
}

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const data = await loadDashboardData(today);
  const pattern = await getPatternForUser(getCurrentUserId());

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Meal Booking Dashboard
        </h1>

        {!data.ok ? (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <div className="font-medium">{ERROR_KIND_LABEL[data.error.kind]}</div>
            <div className="mt-1 text-sm">{data.error.message}</div>
          </div>
        ) : (
          <>
            {data.quota.quotaPendingMessage && (
              <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {data.quota.quotaPendingMessage}
              </div>
            )}

            <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <QuotaCard label="Current Quota" value={data.quota.currentQuotaDesc} />
              <QuotaCard label="Balance" value={data.quota.balanceDesc} />
              <QuotaCard label="COB Quota" value={data.quota.cobQuotaDesc} />
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                Upcoming Bookings
              </h2>
              {data.bookings.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No upcoming bookings.
                </p>
              )}
              <div className="mt-3">
                <BookingsCalendar bookings={data.bookings} />
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                Book a Meal
              </h2>
              <div className="mt-3">
                <BookMealPanel today={today} />
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                Request a Quota Increase
              </h2>
              <div className="mt-3">
                <IncreasePanel
                  label="quota"
                  endpoint="/api/quota/increase"
                  options={data.quota.quotaIncreaseDTO.map((o) => ({
                    code: o.quotaIncreaseCode,
                    amount: o.quotaIncreaseAmount,
                  }))}
                  pendingMessage={data.quota.quotaPendingMessage}
                />
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                Request a COB Increase
              </h2>
              <div className="mt-3">
                <IncreasePanel
                  label="COB"
                  endpoint="/api/cob/increase"
                  options={data.quota.cobIncreaseDTO.map((o) => ({
                    code: o.cobIncreaseCode,
                    amount: o.cobIncreaseAmount,
                  }))}
                  pendingMessage={data.quota.quotaPendingMessage}
                />
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                Weekly Pattern
              </h2>
              <div className="mt-3">
                <WeeklyPatternPanel initialPattern={pattern} today={today} />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
