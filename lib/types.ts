export type Kayak = {
  id: string;
  code: string | null;
  name: string;
  capacity: number;
  length_feet: number | null;
  daily_rate_cents: number;
  stripe_product_id: string | null;
  color: string;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
};

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export type Booking = {
  id: string;
  reference_code: string | null;
  kayak_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  stay_location: string | null;
  lodgify_reservation_id: string | null;
  is_complimentary: boolean;
  waiver_accepted_at: string | null;
  starts_at: string;
  ends_at: string;
  rate_type: "hourly" | "daily";
  amount_cents: number;
  status: BookingStatus;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingSuccessKayakCode = {
  kayakId: string;
  name: string;
  code: string | null;
};

export type BookingSuccess = {
  bookingId: string;
  bookingIds?: string[];
  referenceCode: string;
  referenceCodes?: string[];
  lockboxCode: string | null;
  lockboxCodes?: BookingSuccessKayakCode[];
  customerName: string;
  dateIso: string;
  kayak: Kayak;
  kayaks?: Kayak[];
  stayLocation: string;
  isComplimentary: boolean;
  amountCents: number;
  totalAmountCents?: number;
};

// Lodgify property ID → cabin display name. Source of truth for which
// properties feed kayak booking eligibility.
export const PROPERTY_TO_CABIN: Record<number, string> = {
  608952: "Fairy House",
  608953: "Desert Rose",
  608954: "Sky Castle",
  608955: "Bird House",
  754651: "Doodle House",
};

export type IncludedStayKayak = {
  itemName: string;
  code: string | null;
  note?: string;
};

export const PROPERTY_INCLUDED_KAYAKS: Record<number, IncludedStayKayak> = {
  608952: {
    itemName: "Paddle boat",
    code: null,
    note: "Fairy House includes a paddle boat instead of a kayak.",
  },
  608953: {
    itemName: "Included kayak",
    code: "3546",
  },
  608954: {
    itemName: "Included kayak",
    code: "1010",
  },
  608955: {
    itemName: "Included kayak",
    code: "3126",
  },
  754651: {
    itemName: "Included kayak",
    code: "1521",
  },
};

export const STAY_OPTIONS = Object.values(PROPERTY_TO_CABIN);
export type StayOption = string;

export type CommerceProduct = {
  id: string;
  title: string;
  sku: string;
  description: string;
  price_cents: number;
  image_urls: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type CommercePurchaseStatus = "pending" | "paid" | "cancelled";

export type CommercePurchaseItem = {
  product_id: string;
  title: string;
  sku: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  image_url: string | null;
};

export type CommercePurchase = {
  id: string;
  reservation_id: string;
  customer_name: string;
  stay_location: string | null;
  status: CommercePurchaseStatus;
  amount_cents: number;
  items: CommercePurchaseItem[];
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_at: string;
  updated_at: string;
};

export const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "#dc2626", label: "Red" },
  { value: "#ea580c", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#16a34a", label: "Green" },
  { value: "#0d9488", label: "Teal" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
];

export function colorLabel(value: string): string {
  return COLOR_OPTIONS.find((c) => c.value === value)?.label ?? "Custom";
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
