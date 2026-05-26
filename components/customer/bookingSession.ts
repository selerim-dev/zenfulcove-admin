"use client";

type GuestBookingSession = {
  reservation: string;
  lastName?: string;
  cabin?: string;
  guestName?: string;
  verifiedAt?: string;
};

const BOOKING_SESSION_KEY = "zc_customer_booking";

function clean(value: unknown) {
  return String(value || "").trim();
}

export function stayHref(reservation: string, lastName = "") {
  const code = clean(reservation);
  const name = clean(lastName);
  if (!code) return "/book";

  const params = new URLSearchParams({ reservation: code });
  if (name) params.set("lastName", name);
  return `/book?${params.toString()}`;
}

export function readGuestBookingSession(): GuestBookingSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(BOOKING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestBookingSession>;
    const reservation = clean(parsed.reservation);
    const lastName = clean(parsed.lastName);
    if (!reservation) return null;
    return {
      reservation,
      lastName,
      cabin: clean(parsed.cabin),
      guestName: clean(parsed.guestName),
      verifiedAt: clean(parsed.verifiedAt),
    };
  } catch {
    return null;
  }
}

export function saveGuestBookingSession(session: GuestBookingSession) {
  if (typeof window === "undefined") return;

  const reservation = clean(session.reservation);
  const lastName = clean(session.lastName);
  if (!reservation) return;

  window.sessionStorage.setItem(
    BOOKING_SESSION_KEY,
    JSON.stringify({
      ...session,
      reservation,
      lastName,
      verifiedAt: session.verifiedAt || new Date().toISOString(),
    })
  );
}

export function savedStayHref() {
  const session = readGuestBookingSession();
  return session ? stayHref(session.reservation, session.lastName) : "/book";
}
