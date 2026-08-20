import Link from "next/link";
import { ChevronRight, CircleAlert } from "lucide-react";

export function HomePriorityNotificationCard({
  count,
  title,
  href
}: {
  count: number;
  title: string;
  href: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-card border border-l-4 border-line border-l-clay bg-surface p-4 shadow-raise transition-colors hover:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-control bg-clay">
        <CircleAlert aria-hidden="true" className="h-4 w-4 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-caption font-bold text-clay-ink">
          対応が必要なこと
          <span className="rounded-full bg-clay px-2 py-0.5 text-[10px] font-bold text-white">{count}件</span>
        </span>
        <span className="mt-1 block truncate text-body font-bold text-ink">{title}</span>
      </span>
      <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 flex-none text-clay-ink" />
    </Link>
  );
}
