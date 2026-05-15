import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function isAdminRequest(request) {
  const cookieStore = await cookies();
  if (cookieStore.get("zc_admin_auth")?.value === "true") return true;

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request?.headers?.get("authorization") || "";
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function requireAdminRequest(request) {
  if (await isAdminRequest(request)) return null;
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
