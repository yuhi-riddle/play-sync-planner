"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Bell, CalendarDays, CalendarRange, House, UsersRound } from "lucide-react";

import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";

/**
 * スマートフォンでは画面下部に固定し、デスクトップではヘッダー直下の静的な行として表示する主要ナビ。
 * 表示するかどうかは getNavigationChrome（lib/domain/account/navigation-visibility.ts）で決め、集中操作画面では出さない。
 */
const items = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plans", label: "カレンダー", icon: CalendarRange },
  { href: "/connections", label: "つながり", icon: UsersRound },
  { href: "/notifications", label: "通知", icon: Bell }
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function formatBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function PrimaryNav({ isSignedIn, unreadCount = 0 }: { isSignedIn: boolean; unreadCount?: number }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).primaryNav) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md sm:static sm:mb-5 sm:grid-cols-5 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
      aria-label="主要な画面"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const badge = item.href === "/notifications" && unreadCount > 0 ? formatBadge(unreadCount) : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${item.label} 未読${unreadCount}件` : undefined}
            className={clsx(
              "relative inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:min-h-11 sm:border sm:px-2 sm:text-body sm:shadow-raise",
              // 選択中は深緑で塗る。カレンダーの選択日と同じ「塗り＝いま選んでいる」にそろえる。
              active ? "border-pine bg-pine text-white" : "border-line bg-surface text-muted hover:text-pine"
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">{item.label}</span>
            {badge ? (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-clay-ink px-1.5 py-0.5 text-[11px] font-bold leading-none text-white sm:-right-1 sm:-top-1"
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
