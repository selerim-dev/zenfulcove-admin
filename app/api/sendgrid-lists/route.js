import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { listAllContactLists } from "@/lib/sendgrid";

export async function GET(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const lists = await listAllContactLists();
    return NextResponse.json({ lists });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load SendGrid lists" },
      { status: 500 }
    );
  }
}
