export function normalizeBookingCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function canonicalBookingCode(value: unknown): string {
  const normalized = normalizeBookingCode(value);
  if (/^b\d+$/.test(normalized)) return normalized.slice(1);
  return normalized;
}

export function bookingCodeCandidates(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  const normalized = normalizeBookingCode(raw);
  const canonical = canonicalBookingCode(raw);
  const candidates = new Set<string>();

  function add(candidate: unknown) {
    const cleaned = normalizeBookingCode(candidate);
    if (cleaned) candidates.add(cleaned);
  }

  add(raw);
  add(normalized);
  add(canonical);

  const tokenMatches = raw.toLowerCase().match(/[a-z]?\d+/g) || [];
  for (const token of tokenMatches) {
    add(token);
    add(canonicalBookingCode(token));
  }

  if (/^\d+$/.test(canonical)) {
    add(`b${canonical}`);
  }

  return Array.from(candidates);
}

export function bookingCodeLookupVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  const canonical = canonicalBookingCode(raw);
  const variants = new Set<string>();

  function add(candidate: unknown) {
    const cleaned = String(candidate ?? "").trim();
    if (cleaned) variants.add(cleaned);
  }

  add(raw);
  add(canonical);
  if (/^\d+$/.test(canonical)) {
    add(`B${canonical}`);
    add(`b${canonical}`);
  }

  return Array.from(variants);
}

export function bookingCodesMatch(left: unknown, right: unknown): boolean {
  const leftCandidates = new Set(bookingCodeCandidates(left));
  const rightCandidates = bookingCodeCandidates(right);
  if (!leftCandidates.size || !rightCandidates.length) return false;
  return rightCandidates.some((candidate) => leftCandidates.has(candidate));
}
