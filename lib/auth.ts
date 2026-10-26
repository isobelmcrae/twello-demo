import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { pool } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";

export const getAuth = cache(async () => betterAuth({
  appName: "Twello",
  baseURL: await getAppUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
}));

export async function getSession() {
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) return null;
  return (await getAuth()).api.getSession({ headers: requestHeaders });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Sign in to continue.");
  return session.user;
}

export async function requirePageUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}
