import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import React from "react";

/**
 * 下部ナビを隠す集中画面用の戻る導線。
 * ホーム画面から開いたPWAにはブラウザの戻るボタンが無いので、
 * これが無いと行き止まりになる。
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 text-body font-bold text-muted transition-colors hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      {children}
    </Link>
  );
}
