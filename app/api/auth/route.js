import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();

  if (password === process.env.ADMIN_PASSWORD) {
    const response = NextResponse.json({ success: true });
    response.cookies.set("zc_admin_auth", "true", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  return NextResponse.json({ success: false }, { status: 401 });
}
