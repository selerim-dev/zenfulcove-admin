import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import {
  ADMIN_SESSION_TTL_MS,
  createAdminSessionToken,
} from "@/lib/adminSession";

export async function POST(request) {
  const { password } = await request.json();

  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  const provided = String(password || "");
  // Require a configured, non-empty password: without this, a missing env
  // var plus an empty request body would compare equal and grant a session.
  if (!adminPassword || provided !== adminPassword) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Admin session signing is not configured." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  return response;
}
