"use client";

import { useState } from "react";

// QR is rendered via the qrserver.com image API so we don't ship a QR encoding
// dependency. The encoded payload is only the public /shop URL.
function qrImageUrl(url: string, size: number) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(
    url
  )}`;
}

export default function PublicShopLink({
  shopUrl,
  publicProductCount,
}: {
  // Canonical URL derived server-side, so a QR printed from a preview or
  // internal deployment domain still points customers at the real site.
  shopUrl: string;
  publicProductCount: number;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shopUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shopUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl font-medium tracking-tight">
          Public Shop Link
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Products marked{" "}
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            Public
          </span>{" "}
          can be purchased at this link without a reservation number. Share the
          URL or QR code for one-off purchases.
          {publicProductCount === 0
            ? " No products are public yet - open a product and enable “Public shop”."
            : ` ${publicProductCount} product${
                publicProductCount === 1 ? " is" : "s are"
              } currently public.`}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="max-w-full truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs">
            {shopUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {copied ? "Copied!" : "Copy URL"}
          </button>
          <a
            href={shopUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Open Shop
          </a>
        </div>
      </div>
      <a
        href={qrImageUrl(shopUrl, 600)}
        target="_blank"
        rel="noreferrer"
        title="Open a printable QR code"
        className="shrink-0 self-center rounded-xl border border-[var(--color-border)] bg-white p-2 transition hover:border-[var(--color-accent)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImageUrl(shopUrl, 160)}
          alt="QR code linking to the public shop"
          width={160}
          height={160}
          className="h-40 w-40"
        />
      </a>
    </section>
  );
}
