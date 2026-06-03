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
