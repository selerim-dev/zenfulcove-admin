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
  endDateIso?: string;
  days?: number;
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
  customer_confirmation_sent_at: string | null;
  team_notification_sent_at: string | null;
  lodgify_note_sent_at: string | null;
  fulfillment_error: string | null;
  created_at: string;
  updated_at: string;
};

// ─── In-Cabin Massage ("Elevate Your Stay") ────────────────────────────────

// Weekly availability template. Keys "0".."6" map to JS getDay() in the
// therapist timezone (0 = Sunday … 6 = Saturday). Each day is a list of
// [open, close] "HH:MM" pairs, or null/[] when the therapist is unavailable.
export type DayHours = [string, string][];
export type WeeklyHours = Record<string, DayHours | null>;

export type MassageTherapist = {
  id: string;
  name: string;
  phone: string | null;
  google_calendar_id: string | null;
  timezone: string;
  weekly_hours: WeeklyHours;
  slot_interval_min: number;
  buffer_min: number;
  lead_time_hours: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MassageService = {
  id: string;
  name: string;
  duration_min: number;
  price_cents: number;
  payout_cents: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MassageBookingStatus =
  | "pending_payment"
  | "pending_therapist"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled"
  | "completed";

export type MassageBooking = {
  id: string;
  therapist_id: string;
  service_id: string | null;
  lodgify_reservation_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  stay_location: string | null;
  service_label: string;
  duration_min: number;
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  payout_cents: number;
  status: MassageBookingStatus;
  therapist_deadline: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  refund_id: string | null;
  google_event_id: string | null;
  payout_paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const MASSAGE_STATUS_LABELS: Record<MassageBookingStatus, string> = {
  pending_payment: "Awaiting payment",
  pending_therapist: "Awaiting therapist",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  completed: "Completed",
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
