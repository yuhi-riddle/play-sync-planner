import Link from "next/link";
import React from "react";

import type { ConnectionGroupEvent } from "@/lib/domain/account/connection-groups";
import { eventDisplayStateLabels } from "@/lib/domain/event/event-filter";

function EventLink({ event }: { event: ConnectionGroupEvent }) {
  return (
    <Link
      href={`/events/${event.eventId}`}
      className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
    >
      <span className="min-w-0 truncate font-bold text-ink">{event.title}</span>
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted">
        <span>
          {event.groupMemberCount}人中{event.memberCount}人
        </span>
        <span aria-hidden="true">・</span>
        <span>{eventDisplayStateLabels[event.displayState]}</span>
      </span>
    </Link>
  );
}

export function ConnectionGroupEvents({ events }: { events: ConnectionGroupEvent[] }) {
  const active = events.filter((event) => event.isActive);
  const finished = events.filter((event) => !event.isActive);

  return (
    <section aria-labelledby="connection-group-events-heading" className="grid gap-3">
      <h2 id="connection-group-events-heading" className="text-xl font-semibold text-ink">
        進めているイベント
      </h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted">このグループの人と進めているイベントはありません。</p>
      ) : (
        <ul className="grid gap-2">
          {active.map((event) => (
            <li key={event.eventId}>
              <EventLink event={event} />
            </li>
          ))}
        </ul>
      )}

      {finished.length > 0 ? (
        <details className="rounded-control border border-line bg-sunken">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-body font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
            最近おわったイベント {finished.length}件
          </summary>
          <ul className="grid gap-2 px-3 pb-3">
            {finished.map((event) => (
              <li key={event.eventId}>
                <EventLink event={event} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
