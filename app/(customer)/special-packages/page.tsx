import ComingSoonFeature from "@/components/customer/ComingSoonFeature";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Special Packages · Zenfulcove Glamping",
};

export default function SpecialPackagesPage() {
  return (
    <ComingSoonFeature
      eyebrow="Special Packages and More"
      title="Special Packages and More"
      note="Extra touches for your stay are on the way. We are shaping this into a simple, cozy place to add the good stuff once everything is ready."
    />
  );
}
