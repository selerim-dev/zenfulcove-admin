import { colorLabel, formatMoney, type Kayak } from "@/lib/types";
import KayakIllustration from "@/components/customer/KayakIllustration";

function describeKayak(k: Kayak): string {
  const parts: string[] = [colorLabel(k.color)];
  if (k.length_feet) parts.push(`${k.length_feet} ft`);
  parts.push(`${k.capacity} ${k.capacity === 1 ? "paddler" : "paddlers"}`);
  return parts.join(" · ");
}

export default function KayakCard({
  kayak,
  isOut = false,
  isSelected = false,
  onClick,
}: {
  kayak: Kayak;
  isOut?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOut}
      aria-label={
        isOut
          ? `${kayak.name} — out for this day`
          : isSelected
            ? `Remove ${kayak.name} from checkout`
            : `Select ${kayak.name}`
      }
      className={`group block w-full overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition ${
        isOut
          ? "cursor-not-allowed opacity-60"
          : isSelected
            ? "cursor-pointer ring-2 ring-[var(--color-accent)]"
          : "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
      }`}
    >
      <div className="relative aspect-[1.65/1] w-full overflow-hidden bg-[var(--color-bg)]">
        {kayak.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={kayak.image_url}
            alt={kayak.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <KayakIllustration
              color={kayak.color}
              capacity={kayak.capacity}
              className="h-1/2 w-auto"
            />
          </div>
        )}
        <span
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
            isOut
              ? "border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"
              : isSelected
                ? "bg-emerald-600 text-white shadow-sm"
              : "bg-[var(--color-accent)] text-white shadow-sm"
          }`}
        >
          {isOut ? "Out" : isSelected ? "Selected" : "Open"}
        </span>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-medium tracking-tight">
              {kayak.name}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
              {describeKayak(kayak)}
            </p>
          </div>
          <span className="whitespace-nowrap text-sm font-medium text-[var(--color-accent-strong)]">
            {formatMoney(kayak.daily_rate_cents)}/day
          </span>
        </div>
        <div
          className={`pt-1 text-sm font-medium ${
            isOut
              ? "invisible"
              : isSelected
                ? "text-emerald-700"
              : "text-[var(--color-accent-strong)] group-hover:underline"
          }`}
          aria-hidden={isOut}
        >
          {isSelected ? "Selected" : "Select"}
        </div>
      </div>
    </button>
  );
}
