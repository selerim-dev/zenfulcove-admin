import CustomerAccessForm from "@/components/customer/CustomerAccessForm";
import BookSessionRestore from "@/components/customer/BookSessionRestore";
import GuestStayDashboard from "./GuestStayDashboard";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation?: string;
    lastName?: string;
    target?: string;
  }>;
}) {
  const { reservation = "", lastName = "", target = "" } = await searchParams;
  const hasCredentials = reservation.trim();
  const formTarget = target === "fleet" ? "fleet" : "stay";

  if (hasCredentials) {
    return (
      <GuestStayDashboard reservation={reservation.trim()} lastName={lastName.trim()} />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <BookSessionRestore target={formTarget} />
      <section className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[340px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[340px] flex-col justify-end bg-black/35 p-6 text-white md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Guest Portal
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
              {formTarget === "fleet"
                ? "Open kayak availability."
                : "Open your stay."}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90 md:text-base">
              {formTarget === "fleet"
                ? "Enter the booking ID from your confirmation to view rental kayak availability for guests."
                : "Enter the booking ID from your confirmation to see arrival details, Wi-Fi, forms, and access-code status."}
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <CustomerAccessForm compact target={formTarget} />
      </div>
    </div>
  );
}
