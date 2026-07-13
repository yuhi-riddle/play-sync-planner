"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { clsx } from "clsx";

import { AdjustmentMonthPicker } from "@/components/adjustment-month-picker";
import { Card, EmptyState } from "@/components/ui";
import { planStatusLabels } from "@/lib/constants";
import {
  buildAdjustmentCalendar,
  type AdjustmentCandidate,
  type CalendarDay
} from "@/lib/domain/adjustment-calendar";
import { buildHomeCalendar, type HomeCalendarItem } from "@/lib/domain/home-calendar";
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

function defaultDateForMonth(month: string) {
  return `${month}-01`;
}

function monthLabel(month: string) {
  const { year, month: monthNumber } = parseMonth(month);
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));
}

function dateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${dateKey}T00:00:00`));
}

function weekdayClass(index: number) {
  if (index === 0) {
    return "text-clay-ink";
  }

  if (index === 6) {
    return "text-sky-700";
  }

  return "text-muted";
}

function dayCellClass(day: CalendarDay) {
  const dayIndex = day.date.getDay();
  const isHoliday = isJapaneseHoliday(day.dateKey);

  if (day.isSelected) {
    return "border-pine bg-moss/18 text-ink shadow-soft";
  }

  if (!day.isCurrentMonth) {
    return "border-line bg-surface text-muted hover:border-moss/35";
  }

  if (dayIndex === 0 || isHoliday) {
    return "border-line bg-clay/8 text-clay-ink hover:border-clay/45";
  }

  if (dayIndex === 6) {
    return "border-line bg-skywash/55 text-sky-800 hover:border-sky-300";
  }

  return "border-line bg-surface text-ink hover:border-moss/45";
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

function buildSearchHref(dateKey: string) {
  return `/plans?month=${dateKey.slice(0, 7)}&date=${dateKey}`;
}

function DayDots({ day, googleCount }: { day: CalendarDay; googleCount: number }) {
  const total = day.candidateCount + googleCount;
  if (total === 0) {
    return null;
  }

  return (
    <span className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
      {day.hasCollecting ? <span className="h-2 w-2 rounded-full bg-honey" /> : null}
      {day.hasConfirmed ? <span className="h-2 w-2 rounded-full bg-moss" /> : null}
      {googleCount > 0 ? <span className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" /> : null}
      {day.hasOverlap ? <span className="rounded-full bg-clay px-1.5 text-[10px] font-bold text-white">重</span> : null}
      {total > 3 ? <span className="text-[10px] font-bold text-muted">+{total - 3}</span> : null}
    </span>
  );
}

function CandidateTimelineItem({ candidate }: { candidate: AdjustmentCandidate }) {
  return (
    <Link
      href={`/plans/${candidate.planId}`}
      className="block rounded-control border border-line bg-surface p-4 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-pine">
            {formatDateTimeRange(candidate.startAt, candidate.endAt, Boolean(candidate.isAllDay))}
          </p>
          <h3 className="mt-1 text-base font-bold text-ink">{candidate.eventTitle}</h3>
          <p className="mt-1 text-sm text-muted">{candidate.planTitle ?? "日程調整"}</p>
        </div>
        <div className="text-sm font-semibold text-muted">
          {planStatusLabels[candidate.status as keyof typeof planStatusLabels] ?? candidate.status}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        ○ {candidate.yes} / △ {candidate.maybe} / × {candidate.no} / 未回答 {candidate.unanswered}
      </p>
    </Link>
  );
}

function GoogleTimelineItem({ item }: { item: HomeCalendarItem }) {
  return (
    <article className="rounded-control border border-sky-200/80 bg-skywash/38 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-skywash px-2 py-0.5 text-[11px] font-bold text-sky-900 ring-1 ring-sky-300">
          Google Calendar
        </span>
        <span className="text-sm font-bold text-pine">
          {formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}
        </span>
      </div>
      <h3 className="mt-2 text-base font-bold text-ink">{item.title}</h3>
      {item.location ? (
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
          {item.location}
        </p>
      ) : null}
    </article>
  );
}

function sortTimelineItems(candidates: AdjustmentCandidate[], googleItems: HomeCalendarItem[]) {
  return [
    ...candidates.map((candidate) => ({ kind: "candidate" as const, startAt: candidate.startAt, candidate })),
    ...googleItems.map((item) => ({ kind: "google" as const, startAt: item.startAt, item }))
  ].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
}

export function AdjustmentCalendarView({
  month,
  selectedDateKey,
  candidates
}: {
  month: string;
  selectedDateKey: string;
  candidates: AdjustmentCandidate[];
}) {
  const [googleItems, setGoogleItems] = useState<HomeCalendarItem[]>([]);
  const [googleState, setGoogleState] = useState<"loading" | "ready" | "disconnected" | "error">("loading");
  const { year, month: monthNumber } = parseMonth(month);
  const previousMonth = moveMonth(month, -1);
  const nextMonth = moveMonth(month, 1);
  const calendar = buildAdjustmentCalendar({ year, month: monthNumber, selectedDateKey, candidates });
  const googleCalendar = useMemo(
    () => buildHomeCalendar({ year, month: monthNumber, selectedDateKey, items: googleItems }),
    [googleItems, monthNumber, selectedDateKey, year]
  );
  const timelineItems = sortTimelineItems(calendar.selectedCandidates, googleCalendar.selectedItems);

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
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/plans?month=${previousMonth}&date=${defaultDateForMonth(previousMonth)}`}
            scroll={false}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="前の月"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Link>
          <AdjustmentMonthPicker currentMonth={month} label={monthLabel(month)} />
          <Link
            href={`/plans?month=${nextMonth}&date=${defaultDateForMonth(nextMonth)}`}
            scroll={false}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="次の月"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-honey" />
            調整中
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-moss" />
            確定済み
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-skywash ring-1 ring-sky-300" />
            Google Calendar
          </span>
        </div>

        <div aria-label="日程調整カレンダーの日付一覧" className="-mx-2 mt-5 overflow-x-auto px-2 pb-2">
          <div className="min-w-[24rem]">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold">
              {["日", "月", "火", "水", "木", "金", "土"].map((label, index) => (
                <div key={label} className={clsx("py-2", weekdayClass(index))}>
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendar.weeks.flat().map((day) => {
                const googleCount = googleCalendar.daysByKey.get(day.dateKey)?.googleCount ?? 0;
                return (
                  <Link
                    key={day.dateKey}
                    href={buildSearchHref(day.dateKey)}
                    scroll={false}
                    className={clsx(
                      "min-h-16 rounded-control border p-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-20 sm:p-2",
                      dayCellClass(day)
                    )}
                    aria-label={`${day.dateKey}の候補とGoogle Calendar予定を表示`}
                    aria-current={day.isSelected ? "date" : undefined}
                  >
                    <span className="text-sm font-bold">{day.day}</span>
                    <DayDots day={day} googleCount={googleCount} />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="scroll-mt-24">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-eyebrow uppercase text-pine">Timeline</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{dateLabel(calendar.selectedDateKey)}</h2>
          </div>
          <div className="text-sm text-muted">
            <p>○ 行ける / △ 微妙 / × 行けない</p>
            {googleState === "loading" ? <p className="text-xs text-muted">Google Calendarを確認中</p> : null}
            {googleState === "disconnected" ? <p className="text-xs text-muted">Google Calendarは未連携です</p> : null}
            {googleState === "error" ? <p className="text-xs text-clay-ink">Google Calendarを取得できませんでした</p> : null}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {timelineItems.length > 0 ? (
            timelineItems.map((entry) =>
              entry.kind === "candidate" ? (
                <CandidateTimelineItem key={`candidate-${entry.candidate.id}`} candidate={entry.candidate} />
              ) : (
                <GoogleTimelineItem key={`google-${entry.item.id}`} item={entry.item} />
              )
            )
          ) : (
            <EmptyState>この日の候補やGoogle Calendar予定はありません。</EmptyState>
          )}
        </div>
      </Card>
    </>
  );
}
