import { listCommerceProducts } from "@/lib/kv";
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
  const products = (await listCommerceProducts()) as CommerceProduct[];

  return (
    <ProductsStorefront
      products={products}
      initialReservation={reservation.trim()}
      initialLastName={lastName.trim()}
    />
  );
}
