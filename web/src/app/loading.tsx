export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
        Logging in to Stellenbosch University&apos;s systems...
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        This can take a few seconds — their login page sometimes needs a couple of tries.
      </p>
    </div>
  );
}
