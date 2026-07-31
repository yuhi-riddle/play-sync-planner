import Link from "next/link";
import React from "react";

import { EVENT_DETAIL_TABS, EVENT_DETAIL_TAB_LABELS, type EventDetailTab } from "@/lib/domain/event-tabs";

export function EventDetailTabs({ eventId, active }: { eventId: string; active: EventDetailTab }) {
  return (
    <nav aria-label="イベントの表示切り替え" className="border-b border-line">
      <ul className="flex">
        {EVENT_DETAIL_TABS.map((tab) => {
          const isActive = tab === active;

          return (
            <li key={tab} className="flex-1">
              <Link
                href={tab === "overview" ? `/events/${eventId}` : `/events/${eventId}?tab=${tab}`}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center border-b-2 px-2 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${
                  isActive ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-pine"
                }`}
              >
                {EVENT_DETAIL_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
