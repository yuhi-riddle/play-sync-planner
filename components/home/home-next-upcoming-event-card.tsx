import { MapPin } from "lucide-react";

import { Badge, Card, SecondaryLink } from "@/components/ui";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import { formatDateTimeRangeWithWeekday } from "@/lib/shared/format";

export function HomeNextUpcomingEventCard({ item }: { item: HomeCalendarItem }) {
  const isCollecting = item.kind === "collecting";
  const badgeTone = isCollecting ? "info" : "done";
  const badgeLabel = isCollecting ? "調整中" : "確定済み";
  const linkLabel = isCollecting ? "日程を確認する" : "詳細を見る";

  return (
    <Card aria-label="次の予定">
      <p className="text-eyebrow uppercase text-pine">次の予定</p>
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badgeTone} dot>
            {badgeLabel}
          </Badge>
          <span className="text-body font-bold tabular-nums text-pine">
            {formatDateTimeRangeWithWeekday(item.startAt, item.endAt, Boolean(item.isAllDay))}
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
          <SecondaryLink href={item.href}>{linkLabel}</SecondaryLink>
        </div>
      ) : null}
    </Card>
  );
}
