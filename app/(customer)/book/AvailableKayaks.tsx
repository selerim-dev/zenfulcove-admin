"use client";

import { useState } from "react";
import BookingModal from "@/components/customer/BookingModal";
import KayakCard from "./KayakCard";
import { type Kayak } from "@/lib/types";

export default function AvailableKayaks({
  kayaks,
  bookedIds,
  dateIso,
  reservation,
  lastName,
}: {
  kayaks: Kayak[];
  bookedIds: string[];
  dateIso: string;
  reservation?: string;
  lastName?: string;
}) {
  const [active, setActive] = useState<Kayak | null>(null);
  const bookedSet = new Set(bookedIds);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kayaks.map((k) => {
          const isOut = bookedSet.has(k.id);
          return (
            <KayakCard
              key={k.id}
              kayak={k}
              isOut={isOut}
              onClick={isOut ? undefined : () => setActive(k)}
            />
          );
        })}
      </div>

      <BookingModal
        kayak={active}
        dateIso={dateIso}
        open={active !== null}
        onClose={() => setActive(null)}
        initialReservation={reservation}
        initialLastName={lastName}
      />
    </>
  );
}
