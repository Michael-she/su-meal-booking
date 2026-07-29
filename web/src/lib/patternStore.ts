import fs from "node:fs/promises";
import path from "node:path";

export interface PatternEntry {
  id: string;
  dayOfWeek: number; // 0=Sun .. 6=Sat, matches Date.getDay()
  slot: string;
  slotDescription: string;
  facilityCode: string;
  facilityDescription: string;
  optionDescription: string;
}

const DATA_DIR = path.join(process.cwd(), "data");

function patternFilePath(userId: string): string {
  return path.join(DATA_DIR, `pattern-${userId}.json`);
}

export async function getPatternForUser(userId: string): Promise<PatternEntry[]> {
  try {
    const raw = await fs.readFile(patternFilePath(userId), "utf-8");
    return JSON.parse(raw) as PatternEntry[];
  } catch {
    return [];
  }
}

export async function savePatternForUser(
  userId: string,
  pattern: PatternEntry[]
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(patternFilePath(userId), JSON.stringify(pattern, null, 2), "utf-8");
}
