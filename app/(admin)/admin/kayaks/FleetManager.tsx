"use client";

import { useState } from "react";
import Image from "next/image";
import KayakIllustration from "@/components/customer/KayakIllustration";
import Modal from "@/components/customer/Modal";
import KayakForm from "./KayakForm";
import { colorLabel, formatMoney, type Kayak } from "@/lib/types";

type ModalState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; kayak: Kayak };

function describeKayak(k: Kayak): string {
  const parts: string[] = [colorLabel(k.color)];
  if (k.length_feet) parts.push(`${k.length_feet} ft`);
  parts.push(`${k.capacity} ${k.capacity === 1 ? "paddler" : "paddlers"}`);
  return parts.join(" · ");
}

export default function FleetManager({ kayaks }: { kayaks: Kayak[] }) {
  const [state, setState] = useState<ModalState>({ mode: "closed" });

  const close = () => setState({ mode: "closed" });

  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {kayaks.map((k) => (
          <li key={k.id}>
            <button
              type="button"
              onClick={() => setState({ mode: "edit", kayak: k })}
              className="block w-full cursor-pointer overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="relative aspect-[1.65/1] w-full overflow-hidden bg-[var(--color-bg)]">
                {k.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={k.image_url}
                    alt={k.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <KayakIllustration
                      color={k.color}
                      capacity={k.capacity}
                      className="h-1/2 w-auto"
                    />
                  </div>
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif text-xl font-medium tracking-tight">
                    {k.name}
                  </h3>
                  {k.code && (
                    <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                      {k.code}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
                  {describeKayak(k)}
                </p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-[var(--color-accent-strong)]">
                    {formatMoney(k.daily_rate_cents)}/day
                  </span>
                  {!k.is_active && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                      Hidden
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}

        <li>
          <button
            type="button"
            onClick={() => setState({ mode: "create" })}
            className="flex h-full min-h-[18rem] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[var(--color-border)] bg-transparent p-6 text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-current bg-white p-1">
              <Image
                src="/logo-mark.png"
                alt=""
                width={48}
                height={48}
                className="h-full w-full rounded-full object-cover"
              />
            </span>
            <span className="text-sm font-medium">Add Rental</span>
          </button>
        </li>
      </ul>

      <Modal
        open={state.mode !== "closed"}
        onClose={close}
        title={state.mode === "edit" ? `Edit ${state.kayak.name}` : "Add a rental"}
      >
        {state.mode === "edit" ? (
          <KayakForm kayak={state.kayak} onSuccess={close} />
        ) : state.mode === "create" ? (
          <KayakForm onSuccess={close} />
        ) : null}
      </Modal>
    </>
  );
}
