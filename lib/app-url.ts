import { headers } from "next/headers";

export async function getAppUrl() {
  const configured = process.env.ZENITH_PUBLIC_URL || process.env.BETTER_AUTH_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.ZENITH_PREVIEW === "true") {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
    if (host && /^[a-z0-9]+(?:-[a-z0-9]+)*\.zh\.run$/i.test(host)) {
      return `https://${host.toLowerCase()}`;
    }
  }
  throw new Error("Set BETTER_AUTH_URL to this deployment's public URL.");
}
