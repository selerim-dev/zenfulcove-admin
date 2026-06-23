"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getConfig, setConfig } from "@/lib/kv";
import {
  createService,
  createTherapist,
  deleteService,
  deleteTherapist,
  getMassageBooking,
  updateMassageBooking,
  updateService,
  updateTherapist,
} from "@/lib/spaBookings";
import { refundMassagePayment } from "@/lib/spaPayments";
import type { WeeklyHours } from "@/lib/types";

async function requireAdminCookie() {
  const cookieStore = await cookies();
  if (cookieStore.get("zc_admin_auth")?.value !== "true") {
    throw new Error("Unauthorized.");
  }
}

function revalidateSpa() {
  revalidatePath("/admin/spa");
  revalidatePath("/spa");
}

function dollarsToCents(value: FormDataEntryValue | null): number {
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error("Amount must be zero or positive.");
  }
  return Math.round(dollars * 100);
}

function parseWeeklyHours(formData: FormData): WeeklyHours {
  const weekly: WeeklyHours = {};
  for (let day = 0; day < 7; day++) {
    const closed = formData.get(`day_${day}_closed`) === "on";
    const open = String(formData.get(`day_${day}_open`) ?? "").trim();
    const close = String(formData.get(`day_${day}_close`) ?? "").trim();
    if (closed || !open || !close) {
      weekly[String(day)] = null;
    } else {
      weekly[String(day)] = [[open, close]];
    }
  }
  return weekly;
}

export async function saveMasterHours(formData: FormData) {
  await requireAdminCookie();
  const masterHours = parseWeeklyHours(formData);
  const config = await getConfig();
  await setConfig({
    ...config,
    spaSettings: { ...(config.spaSettings || {}), masterHours },
  });
  revalidateSpa();
}

function parseTherapistFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");
  return {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    google_calendar_id:
      String(formData.get("google_calendar_id") ?? "").trim() || null,
    timezone: String(formData.get("timezone") ?? "").trim() || "America/Chicago",
    slot_interval_min: Math.max(
      5,
      Math.min(240, Math.round(Number(formData.get("slot_interval_min") || 30)))
    ),
    buffer_min: Math.max(0, Math.round(Number(formData.get("buffer_min") || 0))),
    lead_time_hours: Math.max(
      0,
      Math.round(Number(formData.get("lead_time_hours") || 0))
    ),
    is_active: formData.get("is_active") === "on",
  };
}

export async function createTherapistAction(formData: FormData) {
  await requireAdminCookie();
  await createTherapist({ ...parseTherapistFields(formData), display_order: 0 });
  revalidateSpa();
}

export async function updateTherapistAction(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing therapist id.");
  await updateTherapist(id, parseTherapistFields(formData));
  revalidateSpa();
}

export async function deleteTherapistAction(id: string) {
  await requireAdminCookie();
  const therapistId = String(id || "").trim();
  if (!therapistId) throw new Error("Missing therapist id.");
  await deleteTherapist(therapistId);
  revalidateSpa();
}

function parseServiceFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Service name is required.");
  const duration = Math.round(Number(formData.get("duration_min") || 0));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Duration must be a positive number of minutes.");
  }
  return {
    name,
    duration_min: duration,
    price_cents: dollarsToCents(formData.get("price")),
    payout_cents: dollarsToCents(formData.get("payout")),
    is_active: formData.get("is_active") === "on",
    display_order: Math.round(Number(formData.get("display_order") || 0)),
  };
}

export async function createServiceAction(formData: FormData) {
  await requireAdminCookie();
  await createService(parseServiceFields(formData));
  revalidateSpa();
}

export async function updateServiceAction(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing service id.");
  await updateService(id, parseServiceFields(formData));
  revalidateSpa();
}

export async function deleteServiceAction(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing service id.");
  await deleteService(id);
  revalidateSpa();
}

export async function markBookingCompleted(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing booking id.");
  await updateMassageBooking(id, { status: "completed" }, "confirmed");
  revalidateSpa();
}

export async function setBookingPayoutPaid(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing booking id.");
  const paid = formData.get("paid") === "true";
  await updateMassageBooking(id, {
    payout_paid_at: paid ? new Date().toISOString() : null,
  });
  revalidateSpa();
}

export async function cancelBookingWithRefund(formData: FormData) {
  await requireAdminCookie();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Missing booking id.");

  const booking = await getMassageBooking(id);
  if (!booking) throw new Error("Booking not found.");

  let refundId = booking.refund_id;
  if (booking.stripe_payment_intent_id && !booking.refund_id) {
    try {
      refundId = await refundMassagePayment(booking.stripe_payment_intent_id);
    } catch (err) {
      throw new Error(
        `Could not refund payment: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  await updateMassageBooking(id, {
    status: "cancelled",
    refund_id: refundId,
    notes: [booking.notes, "Cancelled by staff."].filter(Boolean).join("\n"),
  });
  revalidateSpa();
}
