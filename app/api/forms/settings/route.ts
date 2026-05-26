import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getLocalFormBySlug } from "@/lib/local-forms";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeSlug(value: unknown) {
  return clean(value).replace(/^\/?forms\//, "") || "welcome-to-zenfulcove";
}

function formResponse(form: Record<string, unknown>) {
  const schema =
    form.schema && typeof form.schema === "object" && !Array.isArray(form.schema)
      ? (form.schema as Record<string, unknown>)
      : {};

  return {
    id: clean(form.id),
    slug: clean(form.slug),
    name: clean(form.name),
    description: clean(form.description),
    isActive: form.is_active !== false,
    termsText: String(schema.termsText || ""),
  };
}

export async function GET(request: Request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Local form database is not configured." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get("slug"));
  const form = await getLocalFormBySlug(slug);
  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  return NextResponse.json({ form: formResponse(form) });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Local form database is not configured." },
      { status: 503 }
    );
  }

  let body: { slug?: unknown; termsText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const slug = normalizeSlug(body.slug);
  const form = await getLocalFormBySlug(slug);
  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const schema =
    form.schema && typeof form.schema === "object" && !Array.isArray(form.schema)
      ? (form.schema as Record<string, unknown>)
      : {};
  const nextSchema = {
    ...schema,
    termsText: String(body.termsText || ""),
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_forms")
    .update({ schema: nextSchema })
    .eq("id", form.id)
    .select("id, slug, name, description, schema, is_active")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update terms: ${error.message}` },
      { status: 500 }
    );
  }

  revalidatePath(`/forms/${data.slug}`);
  revalidatePath("/admin/forms");

  return NextResponse.json({ ok: true, form: formResponse(data) });
}
