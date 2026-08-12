"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  getAppCredentials,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/appAuth";

export interface LoginState {
  error?: string;
}

async function setSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const configured = getAppCredentials();
  if (!configured) {
    return {
      error:
        "No login configured — set DASHBOARD_USERNAME / DASHBOARD_PASSWORD in web/.env.local, or use the bypass button below.",
    };
  }
  if (username !== configured.username || password !== configured.password) {
    return { error: "Incorrect username or password." };
  }

  await setSessionCookie();
  redirect("/");
}

export async function bypassLogin(): Promise<void> {
  await setSessionCookie();
  redirect("/");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
