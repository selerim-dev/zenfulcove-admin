"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hasAdminSessionCookie } from "@/lib/adminAuth";
import { commerceSku } from "@/lib/commerce";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  deleteCommerceProduct,
  getCommerceProduct,
  saveCommerceProduct,
} from "@/lib/kv";
import type { CommerceProduct } from "@/lib/types";

const PRODUCT_IMAGE_BUCKET = "kayak-images";
const PRODUCT_IMAGE_PREFIX = "products";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_SLOTS = 3;

async function requireAdminCookie() {
  if (!(await hasAdminSessionCookie())) {
    throw new Error("Unauthorized.");
  }
}

function parseProductFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceDollars = Number(formData.get("price"));
  const displayOrder = Number(formData.get("display_order") || 0);
  const isActive = formData.get("is_active") === "on";
  const isPublic = formData.get("is_public") === "on";

  if (!title) throw new Error("Title is required.");
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    throw new Error("Price must be zero or positive.");
  }
  if (!Number.isFinite(displayOrder)) {
    throw new Error("Display order must be a number.");
  }

  const priceCents = Math.round(priceDollars * 100);
  return {
    title,
    description,
    price_cents: priceCents,
    sku: commerceSku(title, priceCents),
    display_order: Math.round(displayOrder),
    is_active: isActive,
    is_public: isPublic,
  };
}

function existingImages(formData: FormData) {
  return Array.from({ length: IMAGE_SLOTS }, (_, index) =>
    String(formData.get(`existing_image_${index}`) ?? "").trim()
  );
}

function extractStoragePath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = `/${PRODUCT_IMAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}

async function deleteStoredImage(publicUrl: string | null | undefined) {
  const path = extractStoragePath(publicUrl);
  if (!path) return;
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  } catch {
    // Orphaned file cleanup is best-effort.
  }
}

async function uploadImageIfPresent(formData: FormData, index: number) {
  const value = formData.get(`image_${index}`);
  if (!(value instanceof File)) return null;
  if (value.size === 0) return null;

  if (!value.type.startsWith("image/")) {
    throw new Error("Product images must be image files.");
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error("Product images must be under 5MB.");
  }

  const ext =
    (value.name.split(".").pop() ?? "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 6) || "jpg";
  const path = `${PRODUCT_IMAGE_PREFIX}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await value.arrayBuffer());
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, buffer, {
      contentType: value.type,
      upsert: false,
    });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

async function resolveImages(formData: FormData) {
  const current = existingImages(formData);
  const next: string[] = [];
  const imagesToDelete: string[] = [];

  for (let index = 0; index < IMAGE_SLOTS; index++) {
    const existing = current[index] || "";
    const uploaded = await uploadImageIfPresent(formData, index);
    const remove = formData.get(`remove_image_${index}`) === "on";

    if (uploaded) {
      if (existing) imagesToDelete.push(existing);
      next[index] = uploaded;
    } else if (remove) {
      if (existing) imagesToDelete.push(existing);
      next[index] = "";
    } else {
      next[index] = existing;
    }
  }

  return {
    imageUrls: next.map((url) => String(url || "").trim()).filter(Boolean),
    imagesToDelete,
  };
}

function revalidateCommerce() {
  revalidatePath("/admin/products");
  revalidatePath("/special-packages");
  revalidatePath("/shop");
}

export async function createProduct(formData: FormData) {
  await requireAdminCookie();
  const fields = parseProductFields(formData);
  const { imageUrls } = await resolveImages(formData);
  const now = new Date().toISOString();

  await saveCommerceProduct({
    id: randomUUID(),
    ...fields,
    image_urls: imageUrls,
    created_at: now,
    updated_at: now,
  } satisfies CommerceProduct);

  revalidateCommerce();
}

export async function updateProduct(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing product id.");

  const existing = (await getCommerceProduct(id)) as CommerceProduct | null;
  if (!existing) throw new Error("Product not found.");

  const fields = parseProductFields(formData);
  const { imageUrls, imagesToDelete } = await resolveImages(formData);
  const updated = {
    ...existing,
    ...fields,
    image_urls: imageUrls,
    updated_at: new Date().toISOString(),
  } satisfies CommerceProduct;

  await saveCommerceProduct(updated);
  await Promise.all(imagesToDelete.map((url) => deleteStoredImage(url)));
  revalidateCommerce();
}

export async function deleteProduct(id: string) {
  await requireAdminCookie();
  const productId = String(id || "").trim();
  if (!productId) throw new Error("Missing product id.");
  const existing = (await getCommerceProduct(productId)) as CommerceProduct | null;
  await deleteCommerceProduct(productId);
  await Promise.all(
    (existing?.image_urls || []).map((url) => deleteStoredImage(url))
  );
  revalidateCommerce();
}
