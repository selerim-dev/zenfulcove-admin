import {
  ensureDefaultCommerceProducts,
  listCommerceProducts,
} from "@/lib/kv";
import type { CommerceProduct } from "@/lib/types";
import ProductsStorefront from "../special-packages/ProductsStorefront";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shop · Zenfulcove Glamping",
};

// Public storefront: only products flagged is_public are shown, and checkout
// works without a reservation number (see /api/commerce/checkout public mode).
export default async function PublicShopPage() {
  await ensureDefaultCommerceProducts();
  const products = ((await listCommerceProducts()) as CommerceProduct[]).filter(
    (product) => product.is_public
  );

  return <ProductsStorefront products={products} mode="public" />;
}
