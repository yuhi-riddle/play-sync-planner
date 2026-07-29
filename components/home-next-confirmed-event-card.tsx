import { MapPin } from "lucide-react";

import { Badge, Card, SecondaryLink } from "@/components/ui";
import type { HomeCalendarItem } from "@/lib/domain/home-calendar";
import { formatDateTimeRange } from "@/lib/format";

export function HomeNextConfirmedEventCard({ item }: { item: HomeCalendarItem }) {
  return (
    <Card aria-label="次の予定">
      <p className="text-eyebrow uppercase text-pine">次の予定</p>
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="done" dot>
            確定済み
          </Badge>
          <span className="text-body font-bold tabular-nums text-pine">
            {formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}
          </span>
        </div>
        <p className="mt-2 text-title text-ink">{item.title}</p>
        {item.location ? (
          <p className="mt-2 inline-flex items-center gap-1 text-caption text-muted">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            {item.location}
          </p>
        ) : null}
      </div>
      {item.href ? (
        <div className="mt-4">
          <SecondaryLink href={item.href}>詳細を見る</SecondaryLink>
        </div>
      ) : null}
    </Card>
  );
}
