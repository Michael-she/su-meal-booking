import fs from "node:fs/promises";
import path from "node:path";

export interface Credentials {
  username: string;
  password: string;
}

// The web app's cwd is web/, so the repo-root credentials.txt (already used
// by su_meal_client.py, and already gitignored at the root) is one level up.
const CREDENTIALS_FILE = path.join(process.cwd(), "..", "credentials.txt");

/** Same two-line format as the root credentials.txt used by su_meal_client.py. */
async function readCredentialsFile(): Promise<Credentials | null> {
  let raw: string;
  try {
    raw = await fs.readFile(CREDENTIALS_FILE, "utf-8");
  } catch {
    return null;
  }
  const [username, password] = raw.split(/\r?\n/).map((line) => line.trim());
  if (!username || !password) {
    throw new Error(
      `${CREDENTIALS_FILE} must have the username on line 1 and the password on line 2.`
    );
  }
  return { username, password };
}

/**
 * Single seam for looking up SU credentials by user id. Today there's only
 * one user, read from the repo-root credentials.txt (preferred, gitignored,
 * shared with su_meal_client.py) or SU_USERNAME/SU_PASSWORD env vars as a
 * fallback; swapping in a real
 * multi-user store (DB row keyed by userId, encrypted at rest) later only
 * requires changing this function — every caller already threads userId
 * through.
 */
export async function getCredentialsForUser(
  userId: string
): Promise<Credentials | null> {
  if (userId !== "default") {
    return null;
  }

  const fromFile = await readCredentialsFile();
  if (fromFile) {
    return fromFile;
  }

  const username = process.env.SU_USERNAME;
  const password = process.env.SU_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `SU credentials not found. Create ${CREDENTIALS_FILE} (username on line 1, ` +
        "password on line 2) or set SU_USERNAME / SU_PASSWORD in web/.env.local."
    );
  }
  return { username, password };
}
