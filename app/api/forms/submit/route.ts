import { NextResponse } from "next/server";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import {
  createLocalFormSubmission,
  extractSubmittedContact,
  getLocalFormBySlug,
} from "@/lib/local-forms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Local form database is not configured yet." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const formSlug = String(body.formSlug || body.form_slug || "guest-info").trim();
  if (!formSlug) {
    return NextResponse.json({ error: "Form slug is required." }, { status: 400 });
  }

  const form = await getLocalFormBySlug(formSlug);
  if (!form || form.is_active === false) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : body;
  const contact = extractSubmittedContact({ ...body, payload });

  if (!contact.email || !EMAIL_RE.test(contact.email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  const submission = await createLocalFormSubmission({
    form,
    formSlug,
    contact,
    payload,
    source: String(body.source || "local").trim() || "local",
  });

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    formSlug: submission.form_slug,
    submittedAt: submission.submitted_at,
  });
}
