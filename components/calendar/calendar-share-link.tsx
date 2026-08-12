import { CalendarPlus, Download } from "lucide-react";
import React from "react";

const linkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2";

export function CalendarShareLink({
  href,
  className = ""
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Google Calendarに追加 新しいタブで開きます"
      className={`${linkClassName} ${className}`}
    >
      <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
      Google Calendarに追加
    </a>
  );
}

/**
 * Googleを使っていない人向けの出口。
 *
 * Googleリンクは1タップで追加画面が開くが、.ics はファイルを落として開く手順になる。
 * 体験が違うので置き換えず、隣に並べる。Apple カレンダー、Outlook などが読める。
 */
export function CalendarIcsLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a href={href} download aria-label="ほかのカレンダー用に予定ファイルをダウンロード" className={`${linkClassName} ${className}`}>
      <Download aria-hidden="true" className="mr-2 h-4 w-4" />
      ほかのカレンダー
    </a>
  );
}
