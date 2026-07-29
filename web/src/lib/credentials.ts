export interface Credentials {
  username: string;
  password: string;
}

/**
 * Single seam for looking up SU credentials by user id. Today there's only
 * one user (env vars); swapping in a real multi-user store (DB row keyed by
 * userId, encrypted at rest) later only requires changing this function —
 * every caller already threads userId through.
 */
export async function getCredentialsForUser(
  userId: string
): Promise<Credentials | null> {
  if (userId !== "default") {
    return null;
  }
  const username = process.env.SU_USERNAME;
  const password = process.env.SU_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "SU_USERNAME / SU_PASSWORD are not set. Add them to web/.env.local."
    );
  }
  return { username, password };
}
