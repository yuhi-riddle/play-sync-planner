"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { clsx } from "clsx";

import { buildHomeAgendaDay, type HomeAgendaItem } from "@/lib/domain/home-agenda";
import { formatDateTimeRange } from "@/lib/format";

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

function nextWeekendDateKey() {
  const today = new Date();
  const day = today.getDay();
  if (day === 0 || day === 6) {
    return toDateKey(today);
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
    return "text-clay";
  }
  if (day === 6) {
    return "text-sky-700";
  }
  return "text-ink/58";
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

function itemBadgeClass(kind: HomeAgendaItem["kind"]) {
  if (kind === "collecting") {
    return "bg-honey/72 text-ink";
  }

  if (kind === "confirmed") {
    return "bg-moss text-white";
  }

  return "bg-skywash text-sky-900";
}

function itemKindLabel(kind: HomeAgendaItem["kind"]) {
  if (kind === "collecting") {
    return "調整中";
  }

  if (kind === "confirmed") {
    return "確定済み";
  }

  return "Google Calendar";
}

function DateShortcut({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "date" : undefined}
      className={clsx(
        "inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2",
        active
          ? "bg-ink text-white shadow-soft"
          : "border border-ink/10 bg-white/78 text-ink/70 hover:border-moss hover:text-pine"
      )}
    >
      {children}
    </Link>
  );
}

function AgendaItem({ item }: { item: HomeAgendaItem }) {
  const content = (
    <div className="rounded-lg border border-ink/8 bg-white/68 p-3 transition-colors hover:border-moss/45">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", itemBadgeClass(item.kind))}>
          {itemKindLabel(item.kind)}
        </span>
        <span className="text-sm font-bold text-pine">{formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}</span>
      </div>
      <p className="mt-2 text-sm font-bold text-ink">{item.title}</p>
      {item.subtitle ? <p className="mt-1 text-xs text-ink/58">{item.subtitle}</p> : null}
      {item.location ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink/58">
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
  initialItems
}: {
  selectedDateKey: string;
  initialItems: HomeAgendaItem[];
}) {
  const [googleItems, setGoogleItems] = useState<HomeAgendaItem[]>([]);
  const [googleState, setGoogleState] = useState<"loading" | "ready" | "disconnected" | "error">("loading");
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const tomorrowKey = useMemo(() => toDateKey(addDays(new Date(), 1)), []);
  const weekendKey = useMemo(() => nextWeekendDateKey(), []);
  const weekDays = useMemo(() => weekDaysFor(selectedDateKey), [selectedDateKey]);
  const previousWeekKey = toDateKey(addDays(dateFromKey(weekDays[0]), -7));
  const nextWeekKey = toDateKey(addDays(dateFromKey(weekDays[0]), 7));
  const items = useMemo(() => [...initialItems, ...googleItems], [googleItems, initialItems]);
  const agenda = buildHomeAgendaDay({ selectedDate: dateFromKey(selectedDateKey), items });

  useEffect(() => {
    let cancelled = false;
    setGoogleState("loading");

    fetch(`/api/google-calendar/freebusy?month=${monthParam(selectedDateKey)}`)
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
  }, [selectedDateKey]);

  return (
    <section className="rounded-lg border border-white/80 bg-cream/88 p-4 shadow-soft backdrop-blur sm:p-5" aria-label="選択日の予定">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">Agenda</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-ink">
            <CalendarDays aria-hidden="true" className="h-5 w-5 text-pine" />
            選択日の予定
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">予定を見たい日だけに絞って確認します。</p>
        </div>
        <div className="text-sm text-ink/58" aria-live="polite">
          {googleState === "loading" ? "Google Calendarを確認中" : null}
          {googleState === "disconnected" ? "Google Calendarは未連携です" : null}
          {googleState === "error" ? <span className="text-clay">Google Calendarを取得できませんでした</span> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="表示する日付">
          <DateShortcut href={`/?date=${todayKey}`} active={selectedDateKey === todayKey}>
            今日
          </DateShortcut>
          <DateShortcut href={`/?date=${tomorrowKey}`} active={selectedDateKey === tomorrowKey}>
            明日
          </DateShortcut>
          <DateShortcut href={`/?date=${weekendKey}`} active={selectedDateKey === weekendKey}>
            週末
          </DateShortcut>
        </nav>

        <div className="rounded-lg border border-moss/16 bg-mist/18 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-ink">日付を選ぶ</p>
            <div className="flex items-center gap-2">
              <Link
                href={`/?date=${previousWeekKey}`}
                scroll={false}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                aria-label="前の週"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href={`/?date=${nextWeekKey}`}
                scroll={false}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                aria-label="次の週"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {weekDays.map((dateKey) => {
              const active = dateKey === selectedDateKey;
              return (
                <Link
                  key={dateKey}
                  href={`/?date=${dateKey}`}
                  scroll={false}
                  aria-current={active ? "date" : undefined}
                  className={clsx(
                    "grid min-h-16 place-items-center rounded-lg border px-1 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                    active
                      ? "border-pine bg-ink text-white shadow-soft"
                      : "border-white/70 bg-cream/72 text-ink hover:border-moss/45 hover:bg-cream/92"
                  )}
                >
                  <span className={clsx("text-[11px] font-bold", active ? "text-white/72" : weekdayTone(dateKey))}>
                    {weekdayLabel(dateKey)}
                  </span>
                  <span className="mt-1 text-sm font-bold">{shortDateLabel(dateKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-moss/14 bg-cream/70 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">Timeline</p>
            <h3 className="mt-1 text-lg font-bold text-ink">{selectedDateLabel(agenda.dateKey)}</h3>
          </div>
          <span className="w-fit rounded-full bg-mist/45 px-2 py-1 text-xs font-bold text-pine">{agenda.items.length}件</span>
        </div>

        <div className="mt-4 grid gap-2">
          {agenda.items.length > 0 ? (
            agenda.items.map((item) => <AgendaItem key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <div className="rounded-lg border border-dashed border-moss/28 bg-cream/55 p-5 text-sm text-ink/62">
              この日の予定はまだありません。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
