import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          SU Meal Booking Dashboard
        </h1>
        <p className="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to continue
        </p>
        <div className="mt-6 rounded-lg border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-900">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
