"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { clsx } from "clsx";

import { buildHomeCalendar, type HomeCalendarDay, type HomeCalendarItem } from "@/lib/domain/home-calendar";
import { formatDateTimeRange } from "@/lib/format";
import { isJapaneseHoliday } from "@/lib/japanese-holidays";

type GoogleCalendarResponse = {
  connected: boolean;
  busy: Array<{
    start: string;
    end: string;
    title: string | null;
    location: string | null;
  }>;
};

function parseMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, month: monthNumber };
}

function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function moveMonth(month: string, amount: number) {
  const { year, month: monthNumber } = parseMonth(month);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return monthParam(date.getFullYear(), date.getMonth() + 1);
}

function monthLabel(month: string) {
  const { year, month: monthNumber } = parseMonth(month);
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));
}

function dateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${dateKey}T00:00:00`));
}

function defaultDateForMonth(month: string) {
  return `${month}-01`;
}

function dayCellClass(day: HomeCalendarDay) {
  const dayIndex = day.date.getDay();
  const isHoliday = isJapaneseHoliday(day.dateKey);

  if (day.isSelected) {
    return "border-pine bg-moss/18 text-ink shadow-soft";
  }

  if (!day.isCurrentMonth) {
    return "border-white/70 bg-white/35 text-ink/30 hover:border-moss/35";
  }

  if (dayIndex === 0 || isHoliday) {
    return "border-white/70 bg-clay/8 text-clay hover:border-clay/45";
  }

  if (dayIndex === 6) {
    return "border-white/70 bg-skywash/55 text-sky-800 hover:border-sky-300";
  }

  return "border-white/70 bg-white/62 text-ink hover:border-moss/45";
}

function weekdayClass(index: number) {
  if (index === 0) {
    return "text-clay";
  }

  if (index === 6) {
    return "text-sky-700";
  }

  return "text-ink/50";
}

function itemBadgeClass(kind: HomeCalendarItem["kind"]) {
  if (kind === "collecting") {
    return "bg-honey/72 text-ink";
  }

  if (kind === "confirmed") {
    return "bg-moss text-white";
  }

  return "bg-skywash text-sky-900";
}

function itemKindLabel(kind: HomeCalendarItem["kind"]) {
  if (kind === "collecting") {
    return "調整中";
  }

  if (kind === "confirmed") {
    return "確定済み";
  }

  return "Google Calendar";
}

function googleItemsFromResponse(response: GoogleCalendarResponse): HomeCalendarItem[] {
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

function DayCountDots({ day }: { day: HomeCalendarDay }) {
  if (day.itemCount === 0) {
    return null;
  }

  return (
    <span className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
      {day.collectingCount > 0 ? <span className="h-2 w-2 rounded-full bg-honey" /> : null}
      {day.confirmedCount > 0 ? <span className="h-2 w-2 rounded-full bg-moss" /> : null}
      {day.googleCount > 0 ? <span className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" /> : null}
      {day.itemCount > 3 ? <span className="text-[10px] font-bold text-ink/48">+{day.itemCount - 3}</span> : null}
    </span>
  );
}

function TimelineItem({ item }: { item: HomeCalendarItem }) {
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

export function HomeMonthCalendar({
  month,
  selectedDateKey,
  initialItems
}: {
  month: string;
  selectedDateKey: string;
  initialItems: HomeCalendarItem[];
}) {
  const [googleItems, setGoogleItems] = useState<HomeCalendarItem[]>([]);
  const [googleState, setGoogleState] = useState<"loading" | "ready" | "disconnected" | "error">("loading");
  const { year, month: monthNumber } = parseMonth(month);
  const previousMonth = moveMonth(month, -1);
  const nextMonth = moveMonth(month, 1);
  const allItems = useMemo(() => [...initialItems, ...googleItems], [googleItems, initialItems]);
  const calendar = buildHomeCalendar({ year, month: monthNumber, selectedDateKey, items: allItems });

  useEffect(() => {
    let cancelled = false;
    setGoogleState("loading");

    fetch(`/api/google-calendar/freebusy?month=${month}`)
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
  }, [month]);

  return (
    <section className="rounded-lg border border-white/80 bg-cream/88 p-4 shadow-soft backdrop-blur sm:p-5" aria-label="月カレンダー">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">Calendar</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{monthLabel(month)}</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">MadoiとGoogle Calendarの予定を月単位で見比べられます。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/?month=${previousMonth}&date=${defaultDateForMonth(previousMonth)}`}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/75 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="前の月"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Link
            href={`/?month=${nextMonth}&date=${defaultDateForMonth(nextMonth)}`}
            scroll={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/75 text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="次の月"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-ink/64">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/62 px-2 py-1">
          <span className="h-2 w-2 rounded-full bg-honey" />
          調整中
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/62 px-2 py-1">
          <span className="h-2 w-2 rounded-full bg-moss" />
          確定済み
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/62 px-2 py-1">
          <span className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" />
          Google Calendar
        </span>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-bold">
        {["日", "月", "火", "水", "木", "金", "土"].map((label, index) => (
          <div key={label} className={clsx("py-2", weekdayClass(index))}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendar.weeks.flat().map((day) => (
          <Link
            key={day.dateKey}
            href={`/?month=${day.dateKey.slice(0, 7)}&date=${day.dateKey}`}
            scroll={false}
            className={clsx(
              "min-h-16 rounded-lg border p-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-20",
              dayCellClass(day)
            )}
            aria-label={`${day.dateKey}の予定を見る`}
            aria-current={day.isSelected ? "date" : undefined}
          >
            <span className="text-sm font-bold">{day.day}</span>
            <DayCountDots day={day} />
          </Link>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-white/70 bg-white/46 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">Timeline</p>
            <h3 className="mt-1 text-lg font-bold text-ink">{dateLabel(calendar.selectedDateKey)}</h3>
          </div>
          {googleState === "loading" ? <p className="text-xs text-ink/52">Google Calendarを確認中</p> : null}
          {googleState === "disconnected" ? <p className="text-xs text-ink/52">Google Calendarは未連携です</p> : null}
          {googleState === "error" ? <p className="text-xs text-clay">Google Calendarを取得できませんでした</p> : null}
        </div>

        <div className="mt-4 grid gap-2">
          {calendar.selectedItems.length > 0 ? (
            calendar.selectedItems.map((item) => <TimelineItem key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <div className="rounded-lg border border-dashed border-moss/28 bg-white/52 p-5 text-sm text-ink/62">
              この日の予定はまだありません。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
