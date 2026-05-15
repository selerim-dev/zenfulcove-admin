"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { COLOR_OPTIONS } from "@/lib/types";

const allowedColors = new Set(COLOR_OPTIONS.map((c) => c.value));

const KAYAK_IMAGE_BUCKET = "kayak-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

async function requireAdminCookie() {
  const cookieStore = await cookies();
  if (cookieStore.get("zc_admin_auth")?.value !== "true") {
    throw new Error("Unauthorized.");
  }
}

type KayakWritable = {
  code: string;
  name: string;
  capacity: number;
  length_feet: number;
  daily_rate_cents: number;
  color: string;
  is_active: boolean;
};

function parseKayakFields(formData: FormData): KayakWritable {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const capacity = Number(formData.get("capacity"));
  const lengthFeet = Number(formData.get("length_feet"));
  const dailyDollars = Number(formData.get("daily_rate"));
  const isActive = formData.get("is_active") === "on";
  const color = String(formData.get("color") ?? "");

  if (!name) throw new Error("Name is required.");
  if (!code) throw new Error("Code is required.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 6) {
    throw new Error("Capacity must be a whole number between 1 and 6.");
  }
  if (!Number.isInteger(lengthFeet) || lengthFeet < 1 || lengthFeet > 30) {
    throw new Error("Length must be a whole number of feet between 1 and 30.");
  }
  if (!Number.isFinite(dailyDollars) || dailyDollars < 0) {
    throw new Error("Daily rate must be zero or positive.");
  }
  if (!allowedColors.has(color)) {
    throw new Error("Pick a valid color.");
  }

  return {
    code,
    name,
    capacity,
    length_feet: lengthFeet,
    daily_rate_cents: Math.round(dailyDollars * 100),
    color,
    is_active: isActive,
  };
}

function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/${KAYAK_IMAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}

async function deleteStoredImage(publicUrl: string | null | undefined) {
  const path = extractStoragePath(publicUrl);
  if (!path) return;
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(KAYAK_IMAGE_BUCKET).remove([path]);
  } catch {
    // Orphaned file isn't fatal; don't block the user's update on cleanup.
  }
}

async function uploadImageIfPresent(
  formData: FormData
): Promise<string | null> {
  const value = formData.get("image");
  if (!(value instanceof File)) return null;
  if (value.size === 0) return null;

  if (!value.type.startsWith("image/")) {
    throw new Error("Photo must be an image file.");
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error("Photo must be under 5MB.");
  }

  const ext = (value.name.split(".").pop() ?? "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6) || "jpg";
  const path = `${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await value.arrayBuffer());
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(KAYAK_IMAGE_BUCKET)
    .upload(path, buffer, {
      contentType: value.type,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(KAYAK_IMAGE_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

function explainSaveError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That code is already in use.";
  return `Save failed: ${error.message}`;
}

export async function createKayak(formData: FormData) {
  await requireAdminCookie();
  const fields = parseKayakFields(formData);
  const imageUrl = await uploadImageIfPresent(formData);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("kayaks").insert({
    ...fields,
    image_url: imageUrl,
  });
  if (error) throw new Error(explainSaveError(error));

  revalidatePath("/admin/kayaks");
  revalidatePath("/book");
  revalidatePath("/fleet");
}

export async function updateKayak(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing kayak id.");

  const fields = parseKayakFields(formData);
  const newImageUrl = await uploadImageIfPresent(formData);

  const supabase = createSupabaseAdminClient();

  let oldImageUrl: string | null = null;
  if (newImageUrl) {
    const { data: existing } = await supabase
      .from("kayaks")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();
    oldImageUrl = existing?.image_url ?? null;
  }

  const update: KayakWritable & { image_url?: string } = { ...fields };
  if (newImageUrl) {
    update.image_url = newImageUrl;
  }

  const { error } = await supabase.from("kayaks").update(update).eq("id", id);
  if (error) {
    // Roll back the orphaned new upload so we don't leak storage.
    if (newImageUrl) {
      await deleteStoredImage(newImageUrl);
    }
    throw new Error(explainSaveError(error));
  }

  if (newImageUrl && oldImageUrl) {
    await deleteStoredImage(oldImageUrl);
  }

  revalidatePath("/admin/kayaks");
  revalidatePath("/book");
  revalidatePath("/fleet");
}

export async function deleteKayak(id: string) {
  await requireAdminCookie();
  if (!id) throw new Error("Missing kayak id.");

  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("kayaks")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("kayaks").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Can't delete: this rental has bookings. Mark it inactive instead."
      );
    }
    throw new Error(`Delete failed: ${error.message}`);
  }

  await deleteStoredImage(existing?.image_url);

  revalidatePath("/admin/kayaks");
  revalidatePath("/book");
  revalidatePath("/fleet");
}

export async function deleteBooking(id: string) {
  await requireAdminCookie();
  if (!id) throw new Error("Missing booking id.");

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath("/admin/kayaks");
  revalidatePath("/book");
}
