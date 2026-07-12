"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";

function isFabVisiblePath(pathname: string) {
  return pathname === "/" || pathname === "/events" || pathname === "/plans" || pathname.startsWith("/plans/");
}

export function MobileEventFab() {
  const pathname = usePathname();

  if (!isFabVisiblePath(pathname)) {
    return null;
  }

  return (
    <Link
      href="/events/new"
      aria-label="イベントを作る"
      className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:hidden"
    >
      <Plus aria-hidden="true" className="h-5 w-5" />
      <span>イベントを作る</span>
    </Link>
  );
}
