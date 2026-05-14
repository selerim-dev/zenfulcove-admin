"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CustomerAccessForm() {
  const router = useRouter();
  const [reservation, setReservation] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = reservation.trim();
    const name = lastName.trim();
    if (!code || !name) {
      setError("Enter your booking code and last name to continue.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reservationId: code, lastName: name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "We could not verify that booking.");
      }

      sessionStorage.setItem(
        "zc_customer_booking",
        JSON.stringify({
          reservation: code,
          lastName: name,
          cabin: json.cabin ?? "",
          guestName: json.guestName ?? "",
          verifiedAt: new Date().toISOString(),
        })
      );

      const params = new URLSearchParams({
        reservation: code,
        lastName: name,
      });
      router.push(`/book?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 grid max-w-xl gap-3 rounded-2xl border border-white/30 bg-black/20 p-4 text-white shadow-2xl backdrop-blur-sm sm:grid-cols-[1fr_1fr_auto]"
      style={{ textShadow: "none" }}
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
          Booking Code
        </span>
        <input
          type="text"
          value={reservation}
          onChange={(e) => setReservation(e.target.value)}
          autoComplete="off"
          className="w-full rounded-xl border border-white/30 bg-white/95 px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-white"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
          Last Name
        </span>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          className="w-full rounded-xl border border-white/30 bg-white/95 px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-white"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="self-end rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
      >
        {submitting ? "Checking" : "Open Portal"}
      </button>
      {error ? (
        <p className="text-sm text-red-100 sm:col-span-3">{error}</p>
      ) : null}
    </form>
  );
}
