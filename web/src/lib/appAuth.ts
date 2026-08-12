import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "su_meal_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// proxy.ts and the login Server Actions are compiled as separate bundles, so
// a per-process random fallback would give each bundle a different secret
// and every login would immediately bounce back to /login. Use a fixed
// (documented, insecure) fallback so both sides agree; set AUTH_SECRET in
// web/.env.local for a real deployment.
const secret = process.env.AUTH_SECRET ?? "su-meal-booking-dev-secret-change-me";

export function createSessionToken(): string {
  return crypto.createHmac("sha256", secret).update("authenticated").digest("hex");
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const expected = createSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface AppCredentials {
  username: string;
  password: string;
}

/**
 * The dashboard's own login (gates the whole app) — distinct from the SU
 * account credentials in credentials.ts. Set these in web/.env.local.
 */
export function getAppCredentials(): AppCredentials | null {
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}
