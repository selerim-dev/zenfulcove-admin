import Link from "next/link";
import { redirect } from "next/navigation";
import CustomerAccessForm from "@/components/customer/CustomerAccessForm";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; number?: string; contact?: string }>;
}) {
  const params = await searchParams;
  if (params.tab === "messages") {
    const next = new URLSearchParams();
    next.set("tab", "messages");
    if (params.number) next.set("number", params.number);
    if (params.contact) next.set("contact", params.contact);
    redirect(`/admin?${next.toString()}`);
  }

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[var(--color-ink)]"
      style={{
        backgroundImage: "url(/landing.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "top center",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 md:px-10 md:py-7">
        <Link href="/" className="flex flex-col leading-none text-white">
          <span className="font-serif text-2xl font-medium tracking-tight">
            Zenfulcove
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/80">
            Kayak Booking
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/book"
            className="rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            Book
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-white/40 bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-white/90"
          >
            Staff Login
          </Link>
        </div>
      </header>

      <section
        className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-12 text-white md:px-10 md:py-16"
        style={{ textShadow: "0 2px 12px rgba(0,0,0,0.45)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em]">
          Reserve a Kayak
        </p>
        <h2 className="mt-4 max-w-3xl font-serif text-5xl font-medium leading-[1.05] tracking-tight md:text-7xl">
          Out on the water.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/90 md:text-lg">
          One rental is included with your stay. Pick a day, claim your boat,
          and add more if the whole crew wants in.
        </p>
        <CustomerAccessForm />
        <div
          className="mt-8 flex flex-wrap gap-3"
          style={{ textShadow: "none" }}
        >
          <Link
            href="/book"
            className="inline-flex items-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--color-accent-strong)]"
          >
            Book a Kayak →
          </Link>
          <Link
            href="/fleet"
            className="inline-flex items-center rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            See the fleet
          </Link>
        </div>
      </section>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-10 pt-6 text-xs text-white/80 md:px-10 md:pb-14">
        <p>
          &copy; {new Date().getFullYear()} Zenfulcove ·{" "}
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>{" "}
          ·{" "}
          <a href="tel:+15122737962" className="hover:text-white">
            +1 (512) 273-7962
          </a>
        </p>
      </footer>
    </div>
  );
}
