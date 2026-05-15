import KayakIllustration from "./KayakIllustration";
import type { Kayak } from "@/lib/types";

// Renders the kayak's photo if one was uploaded; falls back to the colored
// SVG illustration. Caller controls sizing via `className` on the wrapper.
export default function KayakVisual({
  kayak,
  className,
  illustrationClassName,
}: {
  kayak: Kayak;
  className?: string;
  illustrationClassName?: string;
}) {
  if (kayak.image_url) {
    return (
      <div
        className={`relative overflow-hidden bg-[var(--color-bg)] ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={kayak.image_url}
          alt={kayak.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-[var(--color-bg)] ${className ?? ""}`}
    >
      <KayakIllustration
        color={kayak.color}
        capacity={kayak.capacity}
        className={illustrationClassName ?? "h-20 w-auto"}
      />
    </div>
  );
}
