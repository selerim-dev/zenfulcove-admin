import Link from "next/link";
import CustomerAccessForm from "@/components/customer/CustomerAccessForm";
import BookSessionRestore from "@/components/customer/BookSessionRestore";
import { getConfig } from "@/lib/kv";
import GuestStayMessages from "./GuestStayMessages";

export const dynamic = "force-dynamic";

export default async function StayMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation?: string;
    lastName?: string;
  }>;
}) {
  const { reservation = "", lastName = "" } = await searchParams;
  const config = await getConfig();
  const messagesEnabled = config?.customerPortal?.navigation?.messages === true;

  if (!messagesEnabled) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
          My Stay Messages
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
          Messages are not available right now.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Use your My Stay page for reservation details, forms, and access-code
          status.
        </p>
        <Link
          href="/book"
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Back to My Stay
        </Link>
      </div>
    );
  }

  const hasCredentials = reservation.trim();

  if (hasCredentials) {
    return (
      <GuestStayMessages
        reservation={reservation.trim()}
        lastName={lastName.trim()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <BookSessionRestore target="messages" />
      <section className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[340px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[340px] flex-col justify-end bg-black/35 p-6 text-white md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              My Stay Messages
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
              Open your stay messages.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90 md:text-base">
              Enter your booking ID to open the conversation for your stay.
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <CustomerAccessForm compact target="messages" />
      </div>
    </div>
  );
}
