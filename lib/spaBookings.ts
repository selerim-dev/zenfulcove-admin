import { getConfig } from "@/lib/kv";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import type {
  MassageBooking,
  MassageBookingStatus,
  MassageService,
  MassageTherapist,
  WeeklyHours,
} from "@/lib/types";

/**
 * Feature flag. The In-Cabin Massage feature is hidden from guests until an
 * admin turns it on (Settings → portal links → "In-Cabin Massage"). Same
 * opt-in default as the Messages nav flag — off unless explicitly enabled.
 */
export async function isSpaEnabled(): Promise<boolean> {
  try {
    const config = await getConfig();
    return config?.customerPortal?.navigation?.spa === true;
  } catch {
    return false;
  }
}

/**
 * Preview bypass: lets staff test the live booking flow before launch while it
 * stays hidden from regular guests. A request carrying ?preview=<secret> (which
 * must equal SPA_PREVIEW_SECRET) is treated as if the feature flag were on.
 * Returns false when the env secret is unset, so it can never accidentally open
 * the feature.
 */
export function spaPreviewMatches(value: string | null | undefined): boolean {
  const secret = String(process.env.SPA_PREVIEW_SECRET || "").trim();
  return Boolean(secret) && String(value || "").trim() === secret;
}

/**
 * The Zenfulcove-wide weekly window that bookings must fall inside. Set in admin
 * (/admin/spa). Bookable times = this window, minus the therapist's calendar
 * busy blocks (and existing bookings).
 */
export async function getSpaMasterHours(): Promise<WeeklyHours> {
  try {
    const config = await getConfig();
    return (config?.spaSettings?.masterHours || {}) as WeeklyHours;
  } catch {
    return {};
  }
}

// Statuses that occupy a therapist's time on the calendar. Mirrors the
// no_therapist_overlap exclusion constraint in 0019_spa_massage.sql.
export const LIVE_BOOKING_STATUSES: MassageBookingStatus[] = [
  "pending_therapist",
  "confirmed",
  "completed",
];

// How long an in-flight checkout (pending_payment) softly holds its slot in the
// availability view, so two guests don't pay for the same time. The hard guard
// is the DB exclusion constraint once a request goes live.
const PENDING_PAYMENT_HOLD_MS = 20 * 60 * 1000;

/** Postgres exclusion_violation — two live bookings overlap for a therapist. */
export function isOverlapError(error: { code?: string } | null | undefined) {
  return error?.code === "23P01";
}

// ─── Therapists ─────────────────────────────────────────────────────────────

export async function listTherapists({
  includeInactive = false,
}: { includeInactive?: boolean } = {}): Promise<MassageTherapist[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("massage_therapists")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MassageTherapist[];
}

export async function getTherapist(id: string): Promise<MassageTherapist | null> {
  const therapistId = String(id || "").trim();
  if (!therapistId) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_therapists")
    .select("*")
    .eq("id", therapistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MassageTherapist | null) ?? null;
}

/**
 * The therapist a new booking routes to. v1: the first active therapist by
 * display order. Future multi-therapist routing replaces this with a
 * next-available-provider lookup without changing the guest experience.
 */
export async function getActiveTherapist(): Promise<MassageTherapist | null> {
  const therapists = await listTherapists();
  return therapists[0] ?? null;
}

export async function createTherapist(
  input: Pick<
    MassageTherapist,
    | "name"
    | "phone"
    | "google_calendar_id"
    | "timezone"
    | "slot_interval_min"
    | "buffer_min"
    | "lead_time_hours"
    | "is_active"
    | "display_order"
  >
): Promise<MassageTherapist> {
  const supabase = createSupabaseAdminClient();
  // weekly_hours is left to its column default ('{}'): hours come from the
  // master accepted range, not per therapist.
  const { data, error } = await supabase
    .from("massage_therapists")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MassageTherapist;
}

export async function updateTherapist(
  id: string,
  patch: Partial<MassageTherapist>
): Promise<MassageTherapist> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_therapists")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MassageTherapist;
}

export async function deleteTherapist(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("massage_therapists")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Services ────────────────────────────────────────────────────────────────

export async function listServices({
  includeInactive = false,
}: { includeInactive?: boolean } = {}): Promise<MassageService[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("massage_services")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MassageService[];
}

export async function getService(id: string): Promise<MassageService | null> {
  const serviceId = String(id || "").trim();
  if (!serviceId) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_services")
    .select("*")
    .eq("id", serviceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MassageService | null) ?? null;
}

export async function createService(
  input: Pick<
    MassageService,
    "name" | "duration_min" | "price_cents" | "payout_cents" | "is_active" | "display_order"
  >
): Promise<MassageService> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_services")
    .insert(input)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MassageService;
}

export async function updateService(
  id: string,
  patch: Partial<MassageService>
): Promise<MassageService> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_services")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MassageService;
}

export async function deleteService(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("massage_services")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export type NewMassageBooking = Pick<
  MassageBooking,
  | "therapist_id"
  | "service_id"
  | "lodgify_reservation_id"
  | "customer_name"
  | "customer_email"
  | "customer_phone"
  | "stay_location"
  | "service_label"
  | "duration_min"
  | "starts_at"
  | "ends_at"
  | "amount_cents"
  | "payout_cents"
>;

export async function createMassageBooking(
  input: NewMassageBooking
): Promise<MassageBooking> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .insert({ ...input, status: "pending_payment" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MassageBooking;
}

export async function getMassageBooking(
  id: string
): Promise<MassageBooking | null> {
  const bookingId = String(id || "").trim();
  if (!bookingId) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MassageBooking | null) ?? null;
}

export async function listBookingsByReservation(
  reservationId: string
): Promise<MassageBooking[]> {
  const id = String(reservationId || "").trim();
  if (!id) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .select("*")
    .eq("lodgify_reservation_id", id)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MassageBooking[];
}

export async function listRecentBookings(limit = 100): Promise<MassageBooking[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as MassageBooking[];
}

/** pending_therapist bookings whose 30-minute window has elapsed. */
export async function listExpiredPendingBookings(
  nowIso = new Date().toISOString()
): Promise<MassageBooking[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .select("*")
    .eq("status", "pending_therapist")
    .lt("therapist_deadline", nowIso);
  if (error) throw new Error(error.message);
  return (data ?? []) as MassageBooking[];
}

/**
 * Update a booking, optionally guarding on its current status so concurrent
 * paths (webhook, therapist link, cron) can't double-process. Returns the
 * updated row, or null when the status guard matched nothing.
 */
export async function updateMassageBooking(
  id: string,
  patch: Partial<MassageBooking>,
  expectedStatus?: MassageBookingStatus | MassageBookingStatus[]
): Promise<MassageBooking | null> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("massage_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (expectedStatus) {
    const statuses = Array.isArray(expectedStatus)
      ? expectedStatus
      : [expectedStatus];
    query = query.in("status", statuses);
  }
  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    if (isOverlapError(error)) {
      const overlap = new Error("slot_unavailable");
      overlap.name = "MassageSlotOverlap";
      throw overlap;
    }
    throw new Error(error.message);
  }
  return (data as MassageBooking | null) ?? null;
}

/**
 * Live bookings for a therapist that overlap [fromUtcIso, toUtcIso). Used to
 * subtract already-taken time from generated availability. Includes recent
 * pending_payment rows as a soft hold during active checkout.
 */
export async function listTherapistBusyIntervals(
  therapistId: string,
  fromUtcIso: string,
  toUtcIso: string
): Promise<{ start: Date; end: Date }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("massage_bookings")
    .select("starts_at, ends_at, status, created_at")
    .eq("therapist_id", therapistId)
    .lt("starts_at", toUtcIso)
    .gt("ends_at", fromUtcIso);
  if (error) throw new Error(error.message);

  const holdCutoff = Date.now() - PENDING_PAYMENT_HOLD_MS;
  return (data ?? [])
    .filter((row) => {
      const status = row.status as MassageBookingStatus;
      if (LIVE_BOOKING_STATUSES.includes(status)) return true;
      return (
        status === "pending_payment" &&
        new Date(row.created_at as string).getTime() >= holdCutoff
      );
    })
    .map((row) => ({
      start: new Date(row.starts_at as string),
      end: new Date(row.ends_at as string),
    }));
}
