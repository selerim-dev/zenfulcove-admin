"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  savedFleetHref,
  savedStayHref,
  savedStayMessagesHref,
} from "./bookingSession";

export default function BookSessionRestore({
  target = "stay",
}: {
  target?: "stay" | "messages" | "fleet";
}) {
  const router = useRouter();

  useEffect(() => {
    const href =
      target === "messages"
        ? savedStayMessagesHref()
        : target === "fleet"
          ? savedFleetHref()
          : savedStayHref();
    const emptyHref =
      target === "messages"
        ? "/book/messages"
        : target === "fleet"
          ? "/book?target=fleet"
          : "/book";
    if (href !== emptyHref) router.replace(href);
  }, [router, target]);

  return null;
}
