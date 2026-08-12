import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import fetchCookieFactory from "fetch-cookie";
import { CasLoginError } from "./suMealClient";

const API_BASE = "https://coblc2.sun.ac.za:9085";
const SERVICE_URL = `${API_BASE}/php/plugin/maties/logintransport`;
const LOGIN_URL = `https://sso-prod.sun.ac.za/cas/login?service=${encodeURIComponent(SERVICE_URL)}`;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/152.0";

export interface CobAccount {
  name: string | null;
  /** Cents. */
  balance: number;
  hash: string;
  primary: string;
}

/**
 * Client for the separate "COB" account-balance dashboard at
 * coblc2.sun.ac.za:9085. Same SU username/password as SUMealClient, but a
 * fully independent CAS session: its own CAS host (sso-prod.sun.ac.za, not
 * sso.sun.ac.za), its own service URL, and a SPACEPORT cookie instead of
 * jsessionid — confirmed from a captured real request. The login form field
 * names (lt/execution/_eventId) are assumed identical to the other CAS flow
 * since both go through the same Apereo CAS product, but that assumption
 * itself is UNVERIFIED — if it's wrong, login() fails loudly rather than
 * silently misbehaving.
 *
 * accounts2's response shape is confirmed against a real response: an array
 * of account objects (see CobAccount below) — a real account, at least,
 * returns exactly one entry.
 */
export class CobClient {
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
        Accept: "application/json, application/json;q=0.8, text/plain;q=0.5, */*;q=0.2",
        Referer: `${API_BASE}/`,
        ...init.headers,
      },
    });
  }

  async login(): Promise<void> {
    // Fresh jar per attempt — see the matching comment in suMealClient.ts's
    // login() for why a reused jar can poison a retry.
    this.jar = new CookieJar();
    this.fetchWithCookies = fetchCookieFactory(fetch, this.jar);

    const loginPage = await this.request(LOGIN_URL);
    const html = await loginPage.text();
    const $ = cheerio.load(html);

    const lt = $('input[name="lt"]').attr("value");
    const execution = $('input[name="execution"]').attr("value");
    if (!lt || !execution) {
      throw new Error(
        "Could not find CAS login ticket fields on sso-prod.sun.ac.za — the login " +
          "form may differ from sso.sun.ac.za's, or the page structure changed."
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
    if (!cookies.some((c) => c.key === "SPACEPORT")) {
      const postHtml = await postRes.text();
      const $post = cheerio.load(postHtml);
      const stillOnCasLoginForm =
        postRes.url.includes("sso-prod.sun.ac.za") && $post('input[name="lt"]').length > 0;

      throw new CasLoginError(
        stillOnCasLoginForm
          ? "CAS returned the login form again after posting credentials — most likely " +
            "rejected as invalid. (Heuristic, unverified against a real bad-credential response.)"
          : "Login to coblc2.sun.ac.za did not yield a SPACEPORT cookie, and the response " +
            "didn't match a known failure pattern. Inspect manually.",
        "unknown"
      );
    }
    this.authenticated = true;
  }

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

  /** Body is "{}" to match the captured request's Content-Length: 2. */
  async getAccounts(): Promise<CobAccount[]> {
    const r = await this.withReauth(() =>
      this.request(`${API_BASE}/php/plugin/launchpadaccounts/accounts2`, {
        method: "POST",
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          Origin: API_BASE,
        },
      })
    );
    if (!r.ok) {
      throw new Error(`accounts2 failed: ${r.status} ${r.statusText}`);
    }
    return r.json() as Promise<CobAccount[]>;
  }
}
