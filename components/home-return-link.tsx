"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

export function HomeReturnLink() {
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/auth/") || pathname.startsWith("/s/")) {
    return null;
  }

  return (
    <div className="mb-5">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-cream/86 px-4 py-2 text-sm font-bold text-pine shadow-soft transition-colors hover:bg-white/78 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        <Home aria-hidden="true" className="h-4 w-4" />
        ホームへ
      </Link>
    </div>
  );
}
