"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { savedStayHref, savedStayMessagesHref } from "./bookingSession";

export default function BookSessionRestore({
  target = "stay",
}: {
  target?: "stay" | "messages";
}) {
  const router = useRouter();

  useEffect(() => {
    const href = target === "messages" ? savedStayMessagesHref() : savedStayHref();
    const emptyHref = target === "messages" ? "/book/messages" : "/book";
    if (href !== emptyHref) router.replace(href);
  }, [router, target]);

  return null;
}
