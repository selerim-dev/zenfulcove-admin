import {
  ensureDefaultCommerceProducts,
  listCommerceProducts,
} from "@/lib/kv";
import { isSpaEnabled } from "@/lib/spaBookings";
import type { CommerceProduct } from "@/lib/types";
import ProductsStorefront from "./ProductsStorefront";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Special Packages · Zenfulcove Glamping",
};

export default async function SpecialPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation?: string;
    lastName?: string;
  }>;
}) {
  const { reservation = "", lastName = "" } = await searchParams;
  await ensureDefaultCommerceProducts();
  const [products, spaEnabled] = await Promise.all([
    listCommerceProducts().then((items) => items as CommerceProduct[]),
    isSpaEnabled(),
  ]);

  return (
    <ProductsStorefront
      products={products}
      spaEnabled={spaEnabled}
      initialReservation={reservation.trim()}
      initialLastName={lastName.trim()}
    />
  );
}
