"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const FIELD_TYPES = new Set([
  "text",
  "email",
  "tel",
  "number",
  "date",
  "textarea",
  "select",
  "checkbox",
  "image",
  "file",
  "signature",
]);

async function requireAdminCookie() {
  const cookieStore = await cookies();
  if (cookieStore.get("zc_admin_auth")?.value !== "true") {
    throw new Error("Unauthorized.");
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseFields(formData: FormData) {
  const count = Number(formData.get("field_count")) || 0;
  const fields: {
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    multiple?: boolean;
    options?: string[];
  }[] = [];

  for (let index = 0; index < count; index += 1) {
    const name = readString(formData, `field_name_${index}`);
    const label = readString(formData, `field_label_${index}`);
    const rawType = readString(formData, `field_type_${index}`);
    const placeholder = readString(formData, `field_placeholder_${index}`);
    const type = FIELD_TYPES.has(rawType) ? rawType : "text";

    if (!name && !label) continue;
    if (!name) throw new Error("Every field needs a field name.");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(
        "Field names must start with a letter and only use letters, numbers, or underscores."
      );
    }

    const field: {
      name: string;
      label: string;
      type: string;
      required: boolean;
      placeholder?: string;
      multiple?: boolean;
      options?: string[];
    } = {
      name,
      label: label || name,
      type,
      required: formData.get(`field_required_${index}`) === "on",
      ...(placeholder ? { placeholder } : {}),
    };

    if (type === "image" || type === "file") {
      field.multiple = formData.get(`field_multiple_${index}`) === "on";
    }

    if (type === "select") {
      field.options = String(formData.get(`field_options_${index}`) || "")
        .split(/\r?\n|,/)
        .map((option) => option.trim())
        .filter(Boolean);
    }

    fields.push(field);
  }

  if (fields.length === 0) {
    throw new Error("Add at least one field.");
  }

  return fields;
}

function parseFormPayload(formData: FormData) {
  const id = readString(formData, "id");
  const name = readString(formData, "name");
  const slug = slugify(readString(formData, "slug") || name);
  const description = readString(formData, "description");
  const submitLabel = readString(formData, "submit_label") || "Submit";
  const successMessage =
    readString(formData, "success_message") ||
    "Thanks. We received your information.";

  if (!name) throw new Error("Form name is required.");
  if (!slug) throw new Error("Form slug is required.");

  return {
    id,
    row: {
      slug,
      name,
      description: description || null,
      is_active: formData.get("is_active") === "on",
      schema: {
        submitLabel,
        successMessage,
        fields: parseFields(formData),
      },
    },
  };
}

function explainSaveError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return "That form slug is already in use.";
  }
  return `Save failed: ${error.message}`;
}

export async function saveLocalForm(formData: FormData) {
  await requireAdminCookie();
  const { id, row } = parseFormPayload(formData);
  const supabase = createSupabaseAdminClient();

  const { error } = id
    ? await supabase.from("local_forms").update(row).eq("id", id)
    : await supabase.from("local_forms").insert(row);

  if (error) throw new Error(explainSaveError(error));

  revalidatePath("/admin/forms");
  revalidatePath(`/forms/${row.slug}`);
}

export async function archiveLocalForm(id: string) {
  await requireAdminCookie();
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing form id.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("local_forms")
    .update({ is_active: false })
    .eq("id", normalizedId);

  if (error) throw new Error(`Archive failed: ${error.message}`);
  revalidatePath("/admin/forms");
}

export async function deleteLocalForm(id: string) {
  await requireAdminCookie();
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing form id.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("local_forms")
    .delete()
    .eq("id", normalizedId);

  if (error) throw new Error(`Delete failed: ${error.message}`);
  revalidatePath("/admin/forms");
}
