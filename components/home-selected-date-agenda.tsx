"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { clsx } from "clsx";

import { buildHomeAgendaDay, type HomeAgendaItem } from "@/lib/domain/home-agenda";
import { formatDateTimeRange } from "@/lib/format";
import { Badge, Card, EmptyState, SectionHeading, type BadgeTone } from "@/components/ui";

type GoogleCalendarResponse = {
  connected: boolean;
  busy: Array<{
    start: string;
    end: string;
    title: string | null;
    location: string | null;
  }>;
};

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function monthParam(dateKey: string) {
  return dateKey.slice(0, 7);
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function weekDaysFor(dateKey: string) {
  const start = startOfWeek(dateFromKey(dateKey));
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
}

function selectedDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(dateFromKey(dateKey));
}

function nextWeekendDateKey(todayDateKey: string) {
  const today = dateFromKey(todayDateKey);
  const day = today.getDay();
  if (day === 0 || day === 6) {
    return todayDateKey;
  }

  return toDateKey(addDays(today, 6 - day));
}

function shortDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric"
  }).format(dateFromKey(dateKey));
}

function weekdayLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(dateFromKey(dateKey));
}

function weekdayTone(dateKey: string) {
  const day = dateFromKey(dateKey).getDay();
  if (day === 0) {
    return "text-clay-ink";
  }
  if (day === 6) {
    return "text-pine";
  }
  return "text-muted";
}

function googleItemsFromResponse(response: GoogleCalendarResponse): HomeAgendaItem[] {
  if (!response.connected) {
    return [];
  }

  return response.busy.map((busyRange, index) => ({
    id: `google-${busyRange.start}-${index}`,
    kind: "google",
    title: busyRange.title || "予定あり",
    location: busyRange.location,
    startAt: busyRange.start,
    endAt: busyRange.end
  }));
}

function itemBadge(kind: HomeAgendaItem["kind"]): { label: string; tone: BadgeTone } {
  if (kind === "collecting") {
    return { label: "調整中", tone: "info" };
  }

  if (kind === "confirmed") {
    return { label: "確定済み", tone: "done" };
  }

  return { label: "Google Calendar", tone: "neutral" };
}

/** 確定は moss、調整中は honey で左端に色を出し、一覧を流し読みできるようにする。 */
function itemAccentClass(kind: HomeAgendaItem["kind"]) {
  if (kind === "collecting") {
    return "border-l-honey";
  }

  if (kind === "confirmed") {
    return "border-l-moss";
  }

  return "border-l-line-strong";
}

function DateShortcut({
  onSelect,
  active,
  children
}: {
  onSelect: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onSelect} aria-current={active ? "date" : undefined} className={clsx("inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2", active ? "bg-ink text-white shadow-soft" : "border border-line-strong bg-surface text-muted hover:border-moss hover:text-pine")}>{children}</button>
  );
}

function AgendaItem({ item }: { item: HomeAgendaItem }) {
  const badge = itemBadge(item.kind);

  const content = (
    <div
      className={clsx(
        "rounded-control border border-l-4 border-line bg-sunken p-3 transition-colors hover:border-moss",
        itemAccentClass(item.kind)
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={badge.tone} dot>
          {badge.label}
        </Badge>
        <span className="text-body font-bold tabular-nums text-pine">
          {formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}
        </span>
      </div>
      <p className="mt-2 text-body font-bold text-ink">{item.title}</p>
      {item.subtitle ? <p className="mt-1 text-caption text-muted">{item.subtitle}</p> : null}
      {item.location ? (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-muted">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
          {item.location}
        </p>
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block focus:outline-none focus:ring-2 focus:ring-clay" scroll={false}>
        {content}
      </Link>
    );
  }

  return content;
}

export function HomeSelectedDateAgenda({
  selectedDateKey,
  todayDateKey,
  initialItems
}: {
  selectedDateKey: string;
  todayDateKey: string;
  initialItems: HomeAgendaItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeDateKey, setActiveDateKey] = useState(selectedDateKey);
  const [googleItems, setGoogleItems] = useState<HomeAgendaItem[]>([]);
  const [googleState, setGoogleState] = useState<"loading" | "ready" | "disconnected" | "error">("loading");
  const tomorrowKey = useMemo(() => toDateKey(addDays(dateFromKey(todayDateKey), 1)), [todayDateKey]);
  const weekendKey = useMemo(() => nextWeekendDateKey(todayDateKey), [todayDateKey]);
  const weekDays = useMemo(() => weekDaysFor(activeDateKey), [activeDateKey]);
  const previousWeekKey = toDateKey(addDays(dateFromKey(weekDays[0]), -7));
  const nextWeekKey = toDateKey(addDays(dateFromKey(weekDays[0]), 7));
  const activeMonth = monthParam(activeDateKey);
  const items = useMemo(() => [...initialItems, ...googleItems], [googleItems, initialItems]);
  const agenda = buildHomeAgendaDay({ selectedDate: dateFromKey(activeDateKey), items });

  useEffect(() => {
    setActiveDateKey(selectedDateKey);
  }, [selectedDateKey]);

  function selectDate(dateKey: string) {
    setActiveDateKey(dateKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", dateKey);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    setGoogleState("loading");

    fetch(`/api/google-calendar/freebusy?month=${activeMonth}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("failed");
        }
        return (await response.json()) as GoogleCalendarResponse;
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setGoogleItems(googleItemsFromResponse(response));
        setGoogleState(response.connected ? "ready" : "disconnected");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setGoogleItems([]);
        setGoogleState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeMonth]);

  return (
    <Card aria-label="選択日の予定">
      <SectionHeading
        title="選択日の予定"
        description="Madoi の確定予定と Google カレンダーをまとめて表示します。"
        icon={<CalendarDays aria-hidden="true" className="h-5 w-5 text-moss" />}
        action={
          <div className="text-caption text-muted" aria-live="polite">
            {googleState === "loading" ? "Google Calendarを確認中" : null}
            {googleState === "disconnected" ? "Google Calendarは未連携です" : null}
            {googleState === "error" ? <span className="text-clay-ink">Google Calendarを取得できませんでした</span> : null}
          </div>
        }
      />

      <div className="mt-4 grid gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="表示する日付">
          <DateShortcut onSelect={() => selectDate(todayDateKey)} active={activeDateKey === todayDateKey}>
            今日
          </DateShortcut>
          <DateShortcut onSelect={() => selectDate(tomorrowKey)} active={activeDateKey === tomorrowKey}>
            明日
          </DateShortcut>
          <DateShortcut onSelect={() => selectDate(weekendKey)} active={activeDateKey === weekendKey}>
            週末
          </DateShortcut>
        </nav>

        <div className="rounded-control border border-line bg-sunken p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body font-bold text-ink">日付を選ぶ</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => selectDate(previousWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay" aria-label="前の週">
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => selectDate(nextWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay" aria-label="次の週">
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div data-testid="home-week-grid" className="mt-3 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-0.5 sm:gap-1">
            {weekDays.map((dateKey) => {
              const active = dateKey === activeDateKey;
              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => selectDate(dateKey)}
                  aria-current={active ? "date" : undefined}
                  className={clsx(
                    "grid min-h-14 min-w-0 place-items-center rounded-control border px-0.5 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-16 sm:px-1",
                    active ? "border-pine bg-ink text-white shadow-soft" : "border-line bg-surface text-ink hover:border-moss"
                  )}
                >
                  <span className={clsx("truncate text-[0.7rem] font-bold sm:text-caption", active ? "text-white/75" : weekdayTone(dateKey))}>
                    {weekdayLabel(dateKey)}
                  </span>
                  <span className="mt-1 truncate text-xs font-bold tabular-nums sm:text-body">{shortDateLabel(dateKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-title text-ink">{selectedDateLabel(agenda.dateKey)}</h3>
          <span className="text-caption font-bold tabular-nums text-muted">{agenda.items.length}件</span>
        </div>

        <div className="mt-3 grid gap-2">
          {agenda.items.length > 0 ? (
            agenda.items.map((item) => <AgendaItem key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <EmptyState icon={<CalendarDays aria-hidden="true" className="h-4 w-4" />}>この日の予定はまだありません。</EmptyState>
          )}
        </div>
      </div>
    </Card>
  );
}
