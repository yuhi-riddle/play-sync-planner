"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays, CalendarRange, House, UsersRound } from "lucide-react";

import { shouldShowPrimaryNavigation } from "@/lib/navigation-visibility";

/**
 * ヘッダー直下の主要ナビ。
 * モバイルでは固定下部ナビ、デスクトップでは本文上のボタン型導線として表示する。
 */
const items = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plans", label: "カレンダー", icon: CalendarRange },
  { href: "/connections", label: "つながり", icon: UsersRound }
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function PrimaryNav() {
  const pathname = usePathname();

  if (!shouldShowPrimaryNavigation(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 gap-1 border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md sm:static sm:mb-5 sm:grid-cols-4 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
      aria-label="主要な画面"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:min-h-11 sm:border sm:px-2 sm:text-body sm:shadow-raise",
              active ? "border-moss bg-mist text-pine" : "border-line bg-surface text-muted hover:text-pine"
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
