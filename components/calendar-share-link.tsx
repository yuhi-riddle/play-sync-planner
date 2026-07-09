import { CalendarPlus } from "lucide-react";
import React from "react";

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
      className={`inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${className}`}
    >
      <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
      Google Calendarに追加
    </a>
  );
}
