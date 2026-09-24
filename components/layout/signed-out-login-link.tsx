"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_PATHS = new Set(["/", "/login"]);

export function SignedOutLoginLink() {
  const pathname = usePathname();

  if (pathname && HIDDEN_PATHS.has(pathname)) {
    return null;
  }

  return (
    <Link
      href="/login"
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-pine transition-colors hover:border-moss hover:bg-skywash/60 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      aria-label="ログイン"
      title="ログイン"
    >
      ログイン
    </Link>
  );
}
