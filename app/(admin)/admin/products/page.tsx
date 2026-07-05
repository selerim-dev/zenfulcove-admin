import Link from "next/link";
import AdminRouteShell from "@/components/AdminRouteShell";
import {
  ensureDefaultCommerceProducts,
  listCommerceProducts,
} from "@/lib/kv";
import type { CommerceProduct } from "@/lib/types";
import ProductsManager from "./ProductsManager";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await ensureDefaultCommerceProducts();
  const products = (await listCommerceProducts({
    includeInactive: true,
  })) as CommerceProduct[];

  return (
    <AdminRouteShell activeCategory="products" activeTitle="Products">
      <header className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Customer Portal
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Products
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Manage purchasable packages and add-ons for guests. Stripe checkout
            is generated automatically from each product title and price.
          </p>
        </div>
        <Link
          href="/special-packages"
          className="w-fit rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          View Guest Page
        </Link>
      </header>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            Catalog ({products.length})
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Click a card to edit.
          </p>
        </div>
        <ProductsManager products={products} />
      </section>
    </AdminRouteShell>
  );
}
