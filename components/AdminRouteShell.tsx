"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

type AdminRouteShellProps = {
  activeCategory: string;
  activeTitle: string;
  children: ReactNode;
  contentWidth?: "normal" | "wide";
};

export default function AdminRouteShell({
  activeCategory,
  activeTitle,
  children,
  contentWidth = "normal",
}: AdminRouteShellProps) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const widthClass =
    contentWidth === "wide" ? "max-w-[92rem]" : "max-w-5xl";

  function handleSelect(category: string) {
    router.push(`/admin?tab=${encodeURIComponent(category)}`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-ink)]">
      <Sidebar
        activeCategory={activeCategory}
        onSelect={handleSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <Header activeTitle={activeTitle} showCron={false} />
        <main className="flex-1 overflow-y-auto">
          <div
            className={`mx-auto w-full ${widthClass} space-y-6 px-4 py-6 md:px-8 md:py-8`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
