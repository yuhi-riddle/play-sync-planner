"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

/**
 * ヘッダー直下の細いナビ。
 * docs/design/03_screen_flow.md の「常時表示の左メニューや下部タブは置かない」方針に沿い、
 * サイドバーでも下部タブでもない最小限の行に留めている。
 */
const items = [
  { href: "/", label: "ホーム" },
  { href: "/events", label: "イベント" },
  { href: "/plans", label: "日程調整カレンダー" }
];

/** 未ログインで見る画面（共有リンクの回答など）ではナビを出さない。 */
const hiddenPrefixes = ["/login", "/consent", "/auth/", "/s/", "/invites/", "/terms", "/privacy"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function PrimaryNav() {
  const pathname = usePathname();

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <nav className="mb-5 flex flex-wrap gap-x-5 gap-y-1" aria-label="主要な画面">
      {items.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center border-b-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2",
              active ? "border-moss text-pine" : "border-transparent text-muted hover:text-pine"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
