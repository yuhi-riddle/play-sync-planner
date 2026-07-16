"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import React from "react";

import { shouldShowPrimaryNavigation } from "@/lib/navigation-visibility";

/**
 * 一覧系の画面だけに出す。
 * 日程調整の詳細では主要アクションが「リンクを配る」「日程を確定」であり、
 * FAB がそれらのボタンに重なって邪魔をする。
 */
function isFabVisiblePath(pathname: string) {
  return pathname === "/" || pathname === "/events" || pathname === "/plans";
}

export function MobileEventFab() {
  const pathname = usePathname();

  if (!isFabVisiblePath(pathname) || !shouldShowPrimaryNavigation(pathname)) return null;

  return (
    <Link
      href="/events/new"
      aria-label="イベントを作る"
      className="fixed right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:hidden"
    >
      <Plus aria-hidden="true" className="h-5 w-5" />
      <span>イベントを作る</span>
    </Link>
  );
}
