import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

export function HomeCreateEventCta({ href = "/events/new" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-card bg-gradient-to-br from-pine to-pine-deep p-5 shadow-soft transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-control bg-white/15">
        <Plus aria-hidden="true" className="h-5 w-5 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-title text-white">イベントを作成する</span>
        <span className="mt-1 block text-caption text-white/80">新しい予定をみんなで調整しましょう</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none text-white/70" />
    </Link>
  );
}
