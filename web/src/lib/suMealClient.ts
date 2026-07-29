import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import fetchCookieFactory from "fetch-cookie";

const SERVICE_URL =
  "https://web-apps.sun.ac.za/student-meal-booking/shiro-cas";
const LOGIN_URL = `https://sso.sun.ac.za/login?service=${SERVICE_URL}`;
const API_BASE = "https://web-apps.sun.ac.za/student-meal-booking/spring/api";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/152.0";

/**
 * CAS login failure, classified by heuristics on the POST response (still on
 * the CAS login form => bad credentials; redirected somewhere unexpected =>
 * possibly an MFA/step-up challenge). Both heuristics are UNVERIFIED: no real
 * bad-credential or MFA response has ever been captured against this
 * service, so treat the `kind` as a best guess, not a confirmed diagnosis.
 * Deliberately triggering a real bad-credential attempt against the live
 * account risks an SU account lockout, so don't do that without asking first
 * — if you need to firm this up, capture a real failure response manually.
 */
export class CasLoginError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid-credentials" | "possible-mfa" | "unknown"
  ) {
    super(message);
    this.name = "CasLoginError";
  }
}

export interface QuotaCode {
  code: string;
  amount: string;
}

export interface QuotaSummary {
  quotaPendingMessage: string | null;
  currentQuotaDesc: string;
  cobQuotaDesc: string;
  balanceDesc: string;
  mealUsageDesc: string | null;
  quotaIncreaseDTO: { quotaIncreaseCode: number; quotaIncreaseAmount: string }[];
  quotaDecreaseDTO: { quotaDecreaseCode: number; quotaDecreaseAmount: string }[];
  cobIncreaseDTO: { cobIncreaseCode: number; cobIncreaseAmount: string }[];
  cobDecreaseDTO: { cobDecreaseCode: number; cobDecreaseAmount: string }[];
}

export interface Booking {
  start: string;
  description: string;
  mealCost: string;
  [key: string]: unknown;
}

export interface Facility {
  code: string;
  description: string;
}

export interface MealOption {
  code: string;
  description: string;
  cost: string | null;
  sessionId: number;
  sessionStart: string;
  sessionEnd: string;
  bookable: boolean;
  reason: string | null;
}

export interface BookMealInput {
  mealDate: string;
  mealSlot: string;
  mealFacility: string;
  mealOption: string;
  mealSession: number;
  excludeWeekends?: boolean;
  advanceBookingDays?: string;
}

/**
 * Ports the Python SUMealClient's CAS scrape-and-post login to Node.
 * Uses a real cross-domain cookie jar (tough-cookie) since sso.sun.ac.za and
 * web-apps.sun.ac.za are different origins and plain fetch() does not persist
 * cookies across calls the way requests.Session() does.
 */
export class SUMealClient {
  private username: string;
  private password: string;
  private fetchWithCookies: typeof fetch;
  private jar: CookieJar;
  private authenticated = false;
  private loginPromise: Promise<void> | null = null;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
    this.jar = new CookieJar();
    this.fetchWithCookies = fetchCookieFactory(fetch, this.jar);
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchWithCookies(url, {
      ...init,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: "https://web-apps.sun.ac.za/student-meal-booking/index.html",
        ...init.headers,
      },
    });
  }

  async login(): Promise<void> {
    // Start from a clean jar on every login attempt. A long-lived client
    // instance accumulates cookies across its lifetime, and a stale/partial
    // set left over from a prior session (e.g. an old jsessionid, or a CAS
    // ticket-granting cookie tied to an attempt that got interrupted) can
    // make a fresh CAS flow fail even though a brand-new session succeeds —
    // observed directly: an isolated script with a fresh jar and the Python
    // client (fresh requests.Session() per run) both succeeded when this
    // client's reused jar was failing to yield a jsessionid on retry.
    this.jar = new CookieJar();
    this.fetchWithCookies = fetchCookieFactory(fetch, this.jar);

    const loginPage = await this.request(LOGIN_URL);
    const html = await loginPage.text();
    const $ = cheerio.load(html);

    const lt = $('input[name="lt"]').attr("value");
    const execution = $('input[name="execution"]').attr("value");
    if (!lt || !execution) {
      throw new Error(
        "Could not find CAS login ticket fields — page structure may have changed."
      );
    }

    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
      lt,
      execution,
      _eventId: "submit",
    });

    const postRes = await this.request(LOGIN_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const cookies = await this.jar.getCookies(API_BASE);
    if (!cookies.some((c) => c.key === "jsessionid")) {
      const postHtml = await postRes.text();
      const $post = cheerio.load(postHtml);
      const stillOnCasLoginForm =
        postRes.url.includes("sso.sun.ac.za") && $post('input[name="lt"]').length > 0;

      if (stillOnCasLoginForm) {
        throw new CasLoginError(
          "CAS returned the login form again after posting credentials — most likely " +
            "rejected as invalid. (Heuristic, unverified against a real bad-credential response.)",
          "invalid-credentials"
        );
      }

      const expectedHost = new URL(SERVICE_URL).host;
      if (!postRes.url.includes(expectedHost) && !postRes.url.includes("sso.sun.ac.za")) {
        throw new CasLoginError(
          `Redirected to an unexpected URL (${postRes.url}) instead of the service or the ` +
            "CAS login page — possibly an MFA/step-up challenge this client doesn't handle. " +
            "(Heuristic, unverified — no real MFA challenge has been observed on this service.)",
          "possible-mfa"
        );
      }

      throw new CasLoginError(
        "Login did not yield a jsessionid cookie, and the response didn't match a known " +
          "failure pattern. Inspect manually.",
        "unknown"
      );
    }
    this.authenticated = true;
  }

  /**
   * Concurrent callers (e.g. getQuotaSummary + getBookings fired via
   * Promise.all) must not each independently kick off login() — two parallel
   * CAS login flows race on the same cookie jar and corrupt each other's
   * session (observed: one login "succeeds" per curl-style isolated test,
   * but two at once against the same client instance reliably fails to
   * yield a jsessionid). Share a single in-flight login promise instead.
   */
  private async ensureAuth(): Promise<void> {
    if (this.authenticated) {
      return;
    }
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  /** Runs fn(); on 401/403 (session expired server-side) re-logs in once and retries. */
  private async withReauth(fn: () => Promise<Response>): Promise<Response> {
    await this.ensureAuth();
    let r = await fn();
    if (r.status === 401 || r.status === 403) {
      this.authenticated = false;
      await this.ensureAuth();
      r = await fn();
    }
    return r;
  }

  private async getJson<T>(path: string): Promise<T> {
    const r = await this.withReauth(() => this.request(`${API_BASE}${path}`));
    if (!r.ok) {
      throw new Error(`GET ${path} failed: ${r.status} ${r.statusText}`);
    }
    return r.json() as Promise<T>;
  }

  async getBookings(fromDate: string, lang = "en"): Promise<Booking[]> {
    return this.getJson<Booking[]>(`/get-meal-bookings-dto/${lang}/${fromDate}`);
  }

  async getQuotaSummary(lang = "en"): Promise<QuotaSummary> {
    return this.getJson<QuotaSummary>(`/get-quota-summary/${lang}`);
  }

  /** Same {code, description} shape as facilities, e.g. {"code": "B", "description": "Breakfast"}. */
  async getMealSlots(mealDate: string, lang = "en"): Promise<Facility[]> {
    return this.getJson<Facility[]>(`/get-meal-slots-dto/${mealDate}/${lang}`);
  }

  async getMealFacilities(
    mealDate: string,
    mealSlot: string,
    lang = "en"
  ): Promise<Facility[]> {
    return this.getJson<Facility[]>(
      `/get-meal-slot-facilities/${lang}/${mealDate}/${mealSlot}`
    );
  }

  async getMealOptions(
    mealDate: string,
    mealSlot: string,
    facilityId: string,
    lang = "en"
  ): Promise<MealOption[]> {
    return this.getJson<MealOption[]>(
      `/get-meal-slot-facility-options/${lang}/${mealDate}/${mealSlot}/${facilityId}`
    );
  }

  /**
   * Request a booking quota increase. amountCents is in cents (confirmed:
   * 50000 == R500). Does NOT apply instantly — see su_meal_client.py's
   * increase_quota docstring for the pending-request behavior observed
   * against the real account.
   */
  async increaseQuota(amountCents: number, lang = "en") {
    const r = await this.withReauth(() =>
      this.request(`${API_BASE}/increase-quota/${lang}/${amountCents}`)
    );
    if (!r.ok) {
      throw new Error(`increase-quota failed: ${r.status} ${r.statusText}`);
    }
    return r.json();
  }

  /**
   * Request a COB (carry-over balance) increase. Endpoint confirmed by
   * reading the real app's js/services/dataService.js (goIncreaseCob):
   * GET spring/api/increase-cob/{lang}/{amountCents}, same cents convention
   * and same async/pending behavior as increaseQuota (a single shared
   * quotaPendingMessage/pending-request slot blocks both quota and COB
   * requests at once — confirmed via a captured response where pending
   * collapsed all four DTOs — quotaIncrease/Decrease and cobIncrease/Decrease
   * — to a single {code: 0} placeholder simultaneously).
   */
  async increaseCob(amountCents: number, lang = "en") {
    const r = await this.withReauth(() =>
      this.request(`${API_BASE}/increase-cob/${lang}/${amountCents}`)
    );
    if (!r.ok) {
      throw new Error(`increase-cob failed: ${r.status} ${r.statusText}`);
    }
    return r.json();
  }

  async bookMeal(input: BookMealInput) {
    const payload = {
      advanceBookingDays: input.advanceBookingDays ?? "",
      excludeWeekends: input.excludeWeekends ?? true,
      mealDate: input.mealDate,
      mealFacility: String(input.mealFacility),
      mealOption: String(input.mealOption),
      mealSession: input.mealSession,
      mealSlot: input.mealSlot,
    };
    const r = await this.withReauth(() =>
      this.request(`${API_BASE}/store-meal-booking/en`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      })
    );
    if (!r.ok) {
      throw new Error(`store-meal-booking failed: ${r.status} ${r.statusText}`);
    }
    return r.json();
  }
}
