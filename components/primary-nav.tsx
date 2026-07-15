"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays, CalendarRange, House, UsersRound } from "lucide-react";

/**
 * ヘッダー直下の主要ナビ。
 * docs/design/03_screen_flow.md の「常時表示の左メニューや下部タブは置かない」方針に沿い、
 * サイドバーでも下部タブでもないボタン型の導線に留めている。
 */
const items = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plans", label: "カレンダー", icon: CalendarRange },
  { href: "/connections", label: "つながり", icon: UsersRound }
];

/** 未ログインで見る画面（共有リンクの回答など）ではナビを出さない。 */
const hiddenPrefixes = ["/login", "/consent", "/auth/", "/onboarding/", "/s/", "/invites/", "/terms", "/privacy"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function PrimaryNav() {
  const pathname = usePathname();

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <nav className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="主要な画面">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-control border px-2 py-2 text-center text-body font-bold shadow-raise transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2",
              active
                ? "border-moss bg-mist text-pine"
                : "border-line bg-surface text-muted hover:border-moss hover:text-pine"
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
