"use client";

import { useState } from "react";
import {
  cancelBookingWithRefund,
  createServiceAction,
  deleteServiceAction,
  markBookingCompleted,
  saveTherapist,
  setBookingPayoutPaid,
  updateServiceAction,
} from "./actions";
import { PROPERTY_TIMEZONE } from "@/lib/dates";
import {
  formatMoney,
  MASSAGE_STATUS_LABELS,
  type MassageBooking,
  type MassageBookingStatus,
  type MassageService,
  type MassageTherapist,
} from "@/lib/types";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STATUS_STYLES: Record<MassageBookingStatus, string> = {
  pending_payment: "bg-[var(--color-bg)] text-[var(--color-ink-muted)] ring-[var(--color-border)]",
  pending_therapist: "bg-amber-50 text-amber-800 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-red-50 text-red-700 ring-red-200",
  cancelled: "bg-[var(--color-bg)] text-[var(--color-ink-muted)] ring-[var(--color-border)]",
  completed: "bg-sky-50 text-sky-800 ring-sky-200",
};

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]";
const labelClass = "text-xs font-medium text-[var(--color-ink-muted)]";
const cardClass =
  "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:p-6";

export default function SpaManager({
  therapist,
  services,
  bookings,
}: {
  therapist: MassageTherapist | null;
  services: MassageService[];
  bookings: MassageBooking[];
}) {
  const [addingService, setAddingService] = useState(false);

  const payoutOwed = bookings
    .filter((b) => b.status === "completed" && !b.payout_paid_at)
    .reduce((sum, b) => sum + b.payout_cents, 0);

  return (
    <div className="space-y-6">
      {therapist ? (
        <TherapistCard therapist={therapist} />
      ) : (
        <div className={cardClass}>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No therapist record found. Run the{" "}
            <span className="font-mono">0019_spa_massage.sql</span> migration to
            seed Bodywork by Beth, then refresh.
          </p>
        </div>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            Services ({services.length})
          </h2>
          <button
            type="button"
            onClick={() => setAddingService((v) => !v)}
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {addingService ? "Close" : "Add service"}
          </button>
        </div>

        {addingService ? (
          <form
            action={createServiceAction}
            className="mb-5 grid gap-3 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-4 md:grid-cols-[1.6fr_repeat(3,0.8fr)_auto]"
          >
            <Field label="Name">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Duration (min)">
              <input
                name="duration_min"
                type="number"
                min={1}
                defaultValue={60}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Price ($)">
              <input
                name="price"
                type="number"
                min={0}
                step="0.01"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Payout ($)">
              <input
                name="payout"
                type="number"
                min={0}
                step="0.01"
                required
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <label className="mb-2 flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked /> Active
              </label>
            </div>
            <div className="md:col-span-full">
              <button
                type="submit"
                className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
              >
                Create service
              </button>
            </div>
          </form>
        ) : null}

        <div className="space-y-3">
          {services.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No services yet.
            </p>
          ) : (
            services.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            Booking requests ({bookings.length})
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Payout owed (completed, unpaid):{" "}
            <span className="font-semibold text-[var(--color-ink)]">
              {formatMoney(payoutOwed)}
            </span>
          </p>
        </div>
        <BookingsTable bookings={bookings} />
      </section>
    </div>
  );
}

function TherapistCard({ therapist }: { therapist: MassageTherapist }) {
  return (
    <section className={cardClass}>
      <h2 className="mb-4 font-serif text-2xl font-medium tracking-tight">
        Therapist & availability
      </h2>
      <form action={saveTherapist} className="space-y-5">
        <input type="hidden" name="id" value={therapist.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input
              name="name"
              defaultValue={therapist.name}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Mobile number (for booking texts)">
            <input
              name="phone"
              defaultValue={therapist.phone ?? ""}
              placeholder="+15125551234"
              className={inputClass}
            />
          </Field>
          <Field label="Google Calendar ID">
            <input
              name="google_calendar_id"
              defaultValue={therapist.google_calendar_id ?? ""}
              placeholder="beth@example.com"
              className={inputClass}
            />
          </Field>
          <Field label="Timezone">
            <input
              name="timezone"
              defaultValue={therapist.timezone}
              className={inputClass}
            />
          </Field>
          <Field label="Slot interval (min)">
            <input
              name="slot_interval_min"
              type="number"
              min={5}
              max={240}
              defaultValue={therapist.slot_interval_min}
              className={inputClass}
            />
          </Field>
          <Field label="Buffer between appts (min)">
            <input
              name="buffer_min"
              type="number"
              min={0}
              defaultValue={therapist.buffer_min}
              className={inputClass}
            />
          </Field>
          <Field label="Lead time (hours)">
            <input
              name="lead_time_hours"
              type="number"
              min={0}
              defaultValue={therapist.lead_time_hours}
              className={inputClass}
            />
          </Field>
          <div className="flex items-end">
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={therapist.is_active}
              />{" "}
              Accepting bookings
            </label>
          </div>
        </div>

        <div>
          <p className={`${labelClass} mb-2`}>Weekly working hours</p>
          <div className="space-y-2">
            {DAY_LABELS.map((label, day) => {
              const windows = therapist.weekly_hours?.[String(day)];
              const first = Array.isArray(windows) ? windows[0] : null;
              const closed = !first;
              return (
                <div
                  key={day}
                  className="grid grid-cols-[7rem_auto_auto_auto] items-center gap-3 text-sm"
                >
                  <span className="font-medium">{label}</span>
                  <label className="flex items-center gap-2 text-[var(--color-ink-muted)]">
                    <input
                      type="checkbox"
                      name={`day_${day}_closed`}
                      defaultChecked={closed}
                    />
                    Closed
                  </label>
                  <input
                    type="time"
                    name={`day_${day}_open`}
                    defaultValue={first ? first[0] : "10:00"}
                    className={inputClass}
                  />
                  <input
                    type="time"
                    name={`day_${day}_close`}
                    defaultValue={first ? first[1] : "19:00"}
                    className={inputClass}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          className="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Save therapist
        </button>
      </form>
    </section>
  );
}

function ServiceRow({ service }: { service: MassageService }) {
  return (
    <form
      action={updateServiceAction}
      className="grid items-end gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 md:grid-cols-[1.6fr_repeat(3,0.8fr)_auto_auto]"
    >
      <input type="hidden" name="id" value={service.id} />
      <input
        type="hidden"
        name="display_order"
        value={service.display_order}
      />
      <Field label="Name">
        <input name="name" defaultValue={service.name} required className={inputClass} />
      </Field>
      <Field label="Duration (min)">
        <input
          name="duration_min"
          type="number"
          min={1}
          defaultValue={service.duration_min}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Price ($)">
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          defaultValue={(service.price_cents / 100).toFixed(2)}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Payout ($)">
        <input
          name="payout"
          type="number"
          min={0}
          step="0.01"
          defaultValue={(service.payout_cents / 100).toFixed(2)}
          required
          className={inputClass}
        />
      </Field>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={service.is_active}
        />{" "}
        Active
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Save
        </button>
        <button
          type="submit"
          formAction={deleteServiceAction}
          onClick={(e) => {
            if (!window.confirm(`Delete "${service.name}"?`)) e.preventDefault();
          }}
          className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </form>
  );
}

function BookingsTable({ bookings }: { bookings: MassageBooking[] }) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-ink-muted)]">
        No booking requests yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-[var(--color-bg)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
          <tr>
            <th className="px-4 py-3">Appointment</th>
            <th className="px-4 py-3">Guest</th>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Payout</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-t border-[var(--color-border)]">
              <td className="px-4 py-3">{formatStamp(b.starts_at)}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{b.customer_name}</div>
                <div className="text-xs text-[var(--color-ink-muted)]">
                  {b.stay_location ?? "—"}
                </div>
              </td>
              <td className="px-4 py-3">{b.service_label}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_STYLES[b.status]}`}
                >
                  {MASSAGE_STATUS_LABELS[b.status]}
                </span>
              </td>
              <td className="px-4 py-3">{formatMoney(b.amount_cents)}</td>
              <td className="px-4 py-3">
                {formatMoney(b.payout_cents)}
                {b.payout_paid_at ? (
                  <span className="ml-1 text-xs text-emerald-700">✓ paid</span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {b.status === "confirmed" ? (
                    <RowButton action={markBookingCompleted} id={b.id}>
                      Mark completed
                    </RowButton>
                  ) : null}
                  {b.status === "completed" ? (
                    <RowButton
                      action={setBookingPayoutPaid}
                      id={b.id}
                      extra={{ paid: b.payout_paid_at ? "false" : "true" }}
                    >
                      {b.payout_paid_at ? "Mark payout unpaid" : "Mark payout paid"}
                    </RowButton>
                  ) : null}
                  {(b.status === "pending_therapist" ||
                    b.status === "confirmed") &&
                  b.stripe_payment_intent_id ? (
                    <RowButton
                      action={cancelBookingWithRefund}
                      id={b.id}
                      danger
                      confirm="Cancel this booking and refund the guest?"
                    >
                      Cancel &amp; refund
                    </RowButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowButton({
  action,
  id,
  children,
  extra = {},
  danger = false,
  confirm,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  children: React.ReactNode;
  extra?: Record<string, string>;
  danger?: boolean;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          danger
            ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
            : "border-[var(--color-border)] bg-white hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        }`}
      >
        {children}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
