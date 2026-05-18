"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { savedStayHref } from "./bookingSession";

export default function BookSessionRestore() {
  const router = useRouter();

  useEffect(() => {
    const href = savedStayHref();
    if (href !== "/book") router.replace(href);
  }, [router]);

  return null;
}
