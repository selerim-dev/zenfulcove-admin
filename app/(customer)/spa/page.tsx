import { getActiveTherapist, isSpaEnabled, listServices } from "@/lib/spaBookings";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import type { MassageService } from "@/lib/types";
import SpaBooking from "./SpaBooking";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "In-Cabin Massage · Zenfulcove Glamping",
};

export default async function SpaPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string; lastName?: string }>;
}) {
  const { reservation = "", lastName = "" } = await searchParams;

  let services: MassageService[] = [];
  let available = false;
  if (hasSupabaseAdminEnv() && (await isSpaEnabled())) {
    try {
      const [svc, therapist] = await Promise.all([
        listServices(),
        getActiveTherapist(),
      ]);
      services = svc;
      available = Boolean(therapist?.is_active);
    } catch (err) {
      // Tables may not exist yet (migration not run) — show the unavailable state.
      console.error("Spa page data load failed:", err);
    }
  }

  return (
    <SpaBooking
      services={services}
      available={available}
      initialReservation={reservation.trim()}
      initialLastName={lastName.trim()}
    />
  );
}
