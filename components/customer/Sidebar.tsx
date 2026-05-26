"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { savedStayHref } from "./bookingSession";

type CustomerPortalNavigation = {
  rentals: boolean;
  availability: boolean;
  forms: boolean;
  terms: boolean;
};

function Icon({
  type,
  className = "",
}: {
  type: "stay" | "calendar" | "terms" | "form" | "login" | "chevron";
  className?: string;
}) {
  if (type === "stay") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (type === "calendar") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (type === "terms") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }
  if (type === "login") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
      </svg>
    );
  }
  if (type === "chevron") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
        <polyline points="15 18 9 12 15 6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 12h6" />
    </svg>
  );
}

const items: {
  key: keyof CustomerPortalNavigation;
  href: string;
  label: string;
  icon: "stay" | "calendar" | "terms";
}[] = [
  { key: "rentals", href: "/book", label: "My Stay", icon: "stay" },
  { key: "availability", href: "/fleet", label: "Kayak Availability", icon: "calendar" },
  { key: "terms", href: "/terms", label: "Terms", icon: "terms" },
];

type PublishedFormNavItem = {
  href: string;
  label: string;
};

export default function Sidebar({
  open,
  collapsed,
  publishedForms,
  navigation,
  onNavigate,
  onToggleCollapse,
}: {
  open: boolean;
  collapsed: boolean;
  publishedForms: PublishedFormNavItem[];
  navigation: CustomerPortalNavigation;
  onNavigate: () => void;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = items.filter((item) => navigation[item.key] !== false);
  const showForms = navigation.forms !== false && publishedForms.length > 0;

  function navClass(active: boolean) {
    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      active
        ? "bg-[var(--color-accent)] text-white shadow-sm"
        : "text-[var(--color-ink)] hover:bg-[var(--color-bg)]"
    } ${collapsed ? "md:justify-center" : ""}`;
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ease-out md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 ${
        collapsed ? "md:w-[72px]" : "md:w-64"
      } ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex h-full flex-col items-start gap-8 p-6 md:p-4">
        <div className={`flex w-full items-start justify-between gap-3 ${collapsed ? "md:justify-center" : ""}`}>
          <Link
            href="/"
            onClick={onNavigate}
            className={`flex flex-col items-start ${collapsed ? "md:hidden" : ""}`}
          >
            <h1 className="font-serif text-3xl font-medium leading-none tracking-tight text-[var(--color-accent-strong)]">
              Zenfulcove Glamping
            </h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Guest Portal
            </p>
          </Link>

          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-ink-muted)] transition hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)] md:flex"
          >
            <Icon
              type="chevron"
              className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <nav className="flex w-full flex-col gap-1">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => {
                  if (item.key === "rentals") {
                    const href = savedStayHref();
                    if (href !== item.href) {
                      event.preventDefault();
                      router.push(href);
                    }
                  }
                  onNavigate();
                }}
                title={collapsed ? item.label : undefined}
                className={navClass(active)}
              >
                <Icon type={item.icon} className="h-5 w-5 shrink-0" />
                <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {showForms ? (
          <nav className="flex w-full flex-col gap-1 border-t border-[var(--color-border)] pt-5">
            <p
              className={`px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] ${
                collapsed ? "md:hidden" : ""
              }`}
            >
              Forms
            </p>
            {publishedForms.map((form) => {
              const active = pathname === form.href;
              return (
                <Link
                  key={form.href}
                  href={form.href}
                  onClick={onNavigate}
                  title={collapsed ? form.label : undefined}
                  className={navClass(active)}
                >
                  <Icon type="form" className="h-5 w-5 shrink-0" />
                  <span className={collapsed ? "md:hidden" : ""}>{form.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-auto w-full space-y-5">
          <div className={`border-t border-[var(--color-border)] pt-5 ${collapsed ? "md:hidden" : ""}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Contact
            </p>
            <div className="mt-2 space-y-1">
              <a
                href="tel:+15122737962"
                className="block text-xs text-[var(--color-ink)] transition hover:text-[var(--color-accent)]"
              >
                +1 (512) 273-7962
              </a>
              <a
                href="mailto:contact@zenfulcove.com"
                className="block break-all text-xs text-[var(--color-ink)] transition hover:text-[var(--color-accent)]"
              >
                contact@zenfulcove.com
              </a>
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-5">
            <Link
              href="/admin"
              onClick={onNavigate}
              title={collapsed ? "Staff Login" : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center text-sm font-medium text-[var(--color-ink)] shadow-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] ${
                collapsed ? "md:px-2" : ""
              }`}
            >
              <Icon type="login" className="h-5 w-5 shrink-0" />
              <span className={collapsed ? "md:hidden" : ""}>Staff Login</span>
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
