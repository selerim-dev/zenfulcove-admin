import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/adminSession";

export const ADMIN_COOKIE_NAME = "zc_admin_auth";

// Shared check for server components and server actions: is there a valid
// (signed, unexpired) admin session cookie on this request?
export async function hasAdminSessionCookie() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export async function isAdminRequest(request) {
  if (await hasAdminSessionCookie()) return true;

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request?.headers?.get("authorization") || "";
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function requireAdminRequest(request) {
  if (await isAdminRequest(request)) return null;
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
