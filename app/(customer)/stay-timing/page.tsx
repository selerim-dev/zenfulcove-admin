import ComingSoonFeature from "@/components/customer/ComingSoonFeature";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stay Timing · Zenfulcove Glamping",
};

export default function StayTimingPage() {
  return (
    <ComingSoonFeature
      eyebrow="Late Check Out/Early Check In"
      title="Late Check Out/Early Check In"
      note="Flexible arrival and departure options are not open for self-service yet. We are keeping this thoughtful so it works with cleaning schedules and nearby reservations."
    />
  );
}
