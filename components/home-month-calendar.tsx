"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { clsx } from "clsx";

import { dayCellClass, weekdayClass } from "@/lib/calendar-styles";
import { dateLabel, defaultDateForMonth, monthLabel, moveMonth, parseMonth } from "@/lib/domain/calendar-month";
import { buildDayAriaLabel, buildHomeCalendar, type HomeCalendarDay, type HomeCalendarItem } from "@/lib/domain/home-calendar";
import { formatDateTimeRange } from "@/lib/format";
import { googleItemsFromResponse, type GoogleCalendarResponse } from "@/lib/google-calendar/free-busy-items";
import { isJapaneseHoliday } from "@/lib/japanese-holidays";

function dayAriaLabel(day: HomeCalendarDay) {
  const summary = buildDayAriaLabel({
    date: day.date,
    isHoliday: isJapaneseHoliday(day.dateKey),
    hasCollecting: day.collectingCount > 0,
    hasConfirmed: day.confirmedCount > 0,
    hasGoogle: day.googleCount > 0
  });

  return `${summary}。この日の予定を見る`;
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

function DayCountDots({ day }: { day: HomeCalendarDay }) {
  if (day.itemCount === 0) {
    return null;
  }

  return (
    <span className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
      {day.collectingCount > 0 ? <span className="h-2 w-2 rounded-full bg-honey" /> : null}
      {day.confirmedCount > 0 ? <span className="h-2 w-2 rounded-full bg-moss" /> : null}
      {day.googleCount > 0 ? <span className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" /> : null}
      {day.itemCount > 3 ? <span className="text-[10px] font-bold text-muted">+{day.itemCount - 3}</span> : null}
    </span>
  );
}

function TimelineItem({ item }: { item: HomeCalendarItem }) {
  const content = (
    <div className="rounded-control border border-line bg-surface p-3 transition-colors hover:border-moss/45">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", itemBadgeClass(item.kind))}>
          {itemKindLabel(item.kind)}
        </span>
        <span className="text-sm font-bold text-pine">{formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}</span>
      </div>
      <p className="mt-2 text-sm font-bold text-ink">{item.title}</p>
      {item.subtitle ? <p className="mt-1 text-xs text-muted">{item.subtitle}</p> : null}
      {item.location ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
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
    <section className="rounded-control border border-line bg-surface p-4 shadow-soft backdrop-blur sm:p-5" aria-label="月カレンダー">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-eyebrow uppercase text-pine">Calendar</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{monthLabel(month)}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">MadoiとGoogle Calendarの予定を月単位で見比べられます。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/?month=${previousMonth}&date=${defaultDateForMonth(previousMonth)}`}
            scroll={false}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="前の月"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Link
            href={`/?month=${nextMonth}&date=${defaultDateForMonth(nextMonth)}`}
            scroll={false}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="次の月"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-honey" />
          調整中
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-moss" />
          確定済み
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" />
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
              "min-h-16 rounded-control border p-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-20",
              dayCellClass(day)
            )}
            aria-label={dayAriaLabel(day)}
            aria-current={day.isSelected ? "date" : undefined}
          >
            <span className="text-sm font-bold">{day.day}</span>
            <DayCountDots day={day} />
          </Link>
        ))}
      </div>

      <div className="mt-5 rounded-control border border-line bg-surface p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-eyebrow uppercase text-pine">Timeline</p>
            <h3 className="mt-1 text-lg font-bold text-ink">{dateLabel(calendar.selectedDateKey)}</h3>
          </div>
          {googleState === "loading" ? <p className="text-xs text-muted">Google Calendarを確認中</p> : null}
          {googleState === "disconnected" ? <p className="text-xs text-muted">Google Calendarは未連携です</p> : null}
          {googleState === "error" ? <p className="text-xs text-clay-ink">Google Calendarを取得できませんでした</p> : null}
        </div>

        <div className="mt-4 grid gap-2">
          {calendar.selectedItems.length > 0 ? (
            calendar.selectedItems.map((item) => <TimelineItem key={`${item.kind}-${item.id}`} item={item} />)
          ) : (
            <div className="rounded-control border border-line bg-sunken p-5 text-sm text-muted">
              この日の予定はまだありません。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
