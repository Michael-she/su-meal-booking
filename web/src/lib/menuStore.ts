import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedMenu } from "./menuVisionClient";

export interface WeeklyMenu extends ParsedMenu {
  id: string;
  savedAt: string;
}

// One level up, outside web/ — see the matching comment in bookingHistoryStore.ts
// for why runtime data can't live inside the Next.js dev server's watched directory.
const DATA_DIR = path.join(process.cwd(), "..", "data", "menus");

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function menuFilePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

/**
 * Id is derived from (facility, startDate) so re-uploading a photo of the
 * same week's menu overwrites the existing file instead of accumulating
 * duplicates.
 */
export async function saveMenu(menu: ParsedMenu): Promise<WeeklyMenu> {
  const id = `${menu.startDate}_${slugify(menu.facility)}`;
  const saved: WeeklyMenu = { ...menu, id, savedAt: new Date().toISOString() };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(menuFilePath(id), JSON.stringify(saved, null, 2), "utf-8");
  return saved;
}

export async function listMenus(): Promise<WeeklyMenu[]> {
  let files: string[];
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const menus = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf-8")) as WeeklyMenu)
  );
  return menus.sort((a, b) => b.startDate.localeCompare(a.startDate));
}
