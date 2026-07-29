import { SUMealClient } from "./suMealClient";
import { getCredentialsForUser } from "./credentials";

/**
 * Resolves which user is making the current request. Today it's always the
 * single "default" user; once there's a real login flow this reads the
 * session/auth cookie instead. Every caller below already threads userId
 * through, so that swap won't touch API route or UI code.
 */
export function getCurrentUserId(): string {
  return "default";
}

// One SUMealClient (and its cookie jar) per user, reused across requests so
// we don't re-run the CAS login on every API call. The client re-logs in on
// its own if the server-side session expires (see withReauth in suMealClient.ts).
const clientsByUser = new Map<string, SUMealClient>();

export async function getClientForUser(userId: string): Promise<SUMealClient> {
  const cached = clientsByUser.get(userId);
  if (cached) {
    return cached;
  }
  const creds = await getCredentialsForUser(userId);
  if (!creds) {
    throw new Error(`No credentials configured for user "${userId}"`);
  }
  const client = new SUMealClient(creds.username, creds.password);
  clientsByUser.set(userId, client);
  return client;
}
