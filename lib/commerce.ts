import type { CommerceProduct } from "@/lib/types";

const PACKAGE_FALLBACK_IMAGES = {
  anniversary:
    "https://static.wixstatic.com/media/30dc3d_492dc125143b46f693c0fd4bfd759154~mv2.jpg",
  birthday:
    "https://static.wixstatic.com/media/30dc3d_38663b580b8b4699a31f910d8e2a9a64~mv2.jpg",
  romance:
    "https://static.wixstatic.com/media/f1c5c0_aafbec66c4b54c81aa466c871e605b8e~mv2.jpg",
  firewood:
    "https://static.wixstatic.com/media/30dc3d_a0558141f7df4f4b80453bbb28307c68~mv2.jpg",
};

const ANNIVERSARY_DETAILS =
  "Includes: small cake, roses, balloons, happy anniversary sign, and petals in a heart shape on the bed.";

export const BIRTHDAY_PACKAGE_DESCRIPTION =
  "Includes a small birthday cake, 12 roses, a Happy Birthday sign on an easel, and 6 colorful balloons.";

export const DEFAULT_PACKAGE_PRODUCTS: CommerceProduct[] = [
  {
    id: "default-birthday-package",
    title: "Birthday Package",
    sku: "birthday-package-150",
    description: BIRTHDAY_PACKAGE_DESCRIPTION,
    price_cents: 15000,
    image_urls: [PACKAGE_FALLBACK_IMAGES.birthday],
    is_active: true,
    is_public: false,
    display_order: 10,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "default-anniversary-package",
    title: "Anniversary Package",
    sku: "anniversary-package-160",
    description: ANNIVERSARY_DETAILS,
    price_cents: 16000,
    image_urls: [PACKAGE_FALLBACK_IMAGES.anniversary],
    is_active: true,
    is_public: false,
    display_order: 20,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "default-wood-1-day-package",
    title: "Wood 1 Day Package",
    sku: "wood-1-day-package-25",
    description: "A bundle of wood that will last for a 1-night stay.",
    price_cents: 2500,
    image_urls: [PACKAGE_FALLBACK_IMAGES.firewood],
    is_active: true,
    is_public: false,
    display_order: 40,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "default-wood-2-day-package",
    title: "Wood 2 Day Package",
    sku: "wood-2-day-package-32",
    description: "A bundle of wood that will last for a 2-night stay.",
    price_cents: 3200,
    image_urls: [PACKAGE_FALLBACK_IMAGES.firewood],
    is_active: true,
    is_public: false,
    display_order: 50,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "default-wood-3-day-package",
    title: "Wood 3 Day Package",
    sku: "wood-3-day-package-39",
    description: "A bundle of wood that will last for a 3-night stay.",
    price_cents: 3900,
    image_urls: [PACKAGE_FALLBACK_IMAGES.firewood],
    is_active: true,
    is_public: false,
    display_order: 60,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z",
  },
];

export function commerceSlug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function commerceSku(title: string, priceCents: number) {
  const slug = commerceSlug(title) || "product";
  const dollars = Math.max(0, Number(priceCents || 0) / 100);
  const price = Number.isInteger(dollars)
    ? String(dollars)
    : dollars.toFixed(2).replace(".", "-");
  return `${slug}-${price}`;
}

export function normalizeCommerceQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(99, Math.floor(quantity)));
}

export function packageProductIdentity(product: CommerceProduct) {
  const value = `${product.title || ""} ${product.sku || ""}`.toLowerCase();
  if (value.includes("anniversary")) return "anniversary";
  if (value.includes("birthday")) return "birthday";
  if (
    value.includes("wood") &&
    (/\b1\b/.test(value) || value.includes("one"))
  ) {
    return "wood-1-day";
  }
  if (
    value.includes("wood") &&
    (/\b2\b/.test(value) || value.includes("two"))
  ) {
    return "wood-2-day";
  }
  if (
    value.includes("wood") &&
    (/\b3\b/.test(value) || value.includes("three"))
  ) {
    return "wood-3-day";
  }
  return commerceSlug(product.sku || product.title || product.id);
}
