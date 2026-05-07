import { NextResponse } from "next/server";
import { listAllContactLists } from "@/lib/sendgrid";

export async function GET() {
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
