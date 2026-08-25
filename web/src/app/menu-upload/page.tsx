import Link from "next/link";
import { connection } from "next/server";
import { listMenus } from "@/lib/menuStore";
import MenuUploadPanel from "../MenuUploadPanel";

export default async function MenuUploadPage() {
  // Same reason as the dashboard: the saved-menu list is read from disk at
  // request time, and would otherwise be frozen at whatever it was when
  // `next build` ran. See app/page.tsx.
  await connection();
  const menus = await listMenus();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Back to dashboard
        </Link>

        <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Weekly Menu Upload
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Upload a photo or scan of the dining hall&apos;s weekly menu. It&apos;s parsed by
          Google Gemini into a structured menu and saved locally.
        </p>

        <div className="mt-6">
          <MenuUploadPanel />
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">Saved Menus</h2>
          {menus.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              No menus saved yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {menus.map((menu) => (
                <li
                  key={menu.id}
                  className="rounded-lg border border-black/10 bg-white p-3 text-sm dark:border-white/15 dark:bg-zinc-900"
                >
                  <div className="font-medium text-zinc-950 dark:text-zinc-50">
                    {menu.facility} — {menu.weekLabel}
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400">
                    {menu.startDate} to {menu.endDate} · saved{" "}
                    {new Date(menu.savedAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
