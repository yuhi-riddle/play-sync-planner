"use client";

import { RefreshCw, Users } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AvailabilitySlot = {
  start: string;
  end: string;
  availableCount: number;
};

type AvailabilityResponse = {
  month: string;
  updatedAt: string;
  participantCount: number;
  slots: AvailabilitySlot[];
};

type AvailabilityErrorResponse = { error?: string; code?: string };
const accessDeniedMessage = "日程調整中の主催者だけが空き状況を集計できます。";

function toTimestamp(value: string) {
  return new Date(value.length === 16 ? `${value}:00+09:00` : value).getTime();
}

function selectedAvailability(slots: AvailabilitySlot[], selectedRange: { start: string; end: string } | null) {
  if (!selectedRange) {
    return null;
  }

  const start = toTimestamp(selectedRange.start);
  const end = toTimestamp(selectedRange.end);
  const selectedSlots = slots.filter((slot) => toTimestamp(slot.start) < end && start < toTimestamp(slot.end));
  if (selectedSlots.length === 0) {
    return null;
  }

  return Math.min(...selectedSlots.map((slot) => slot.availableCount));
}

function summarizeDailyAvailability(slots: AvailabilitySlot[], participantCount: number) {
  const totals = slots.reduce<Record<string, { total: number; slotCount: number }>>((result, slot) => {
    const date = slot.start.slice(0, 10);
    const current = result[date] ?? { total: 0, slotCount: 0 };
    result[date] = { total: current.total + slot.availableCount, slotCount: current.slotCount + 1 };
    return result;
  }, {});

  return Object.fromEntries(
    Object.entries(totals).map(([date, value]) => [
      date,
      { averageAvailableCount: Math.round((value.total / value.slotCount) * 10) / 10, participantCount }
    ])
  );
}

export function GroupAvailabilityCalendar({
  eventId,
  visibleMonth,
  selectedRange,
  onAvailabilityByDate
}: {
  eventId: string;
  visibleMonth: string;
  selectedRange: { start: string; end: string } | null;
  onAvailabilityByDate?: (availabilityByDate: Record<string, { averageAvailableCount: number; participantCount: number }>) => void;
}) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setErrorCode("");

    fetch(`/api/events/${eventId}/availability?month=${visibleMonth}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as AvailabilityResponse | AvailabilityErrorResponse;
        if (!response.ok) {
          const reason = new Error("error" in data && data.error ? data.error : "空き状況を取得できませんでした。");
          if ("code" in data && data.code) {
            reason.name = data.code;
          }
          throw reason;
        }
        return data as AvailabilityResponse;
      })
      .then((data) => setAvailability(data))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setAvailability(null);
        setErrorCode(reason instanceof Error ? reason.name : "");
        setError(reason instanceof Error ? reason.message : "空き状況を取得できませんでした。");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [eventId, refreshKey, visibleMonth]);

  const selectedAvailableCount = useMemo(
    () => selectedAvailability(availability?.slots ?? [], selectedRange),
    [availability?.slots, selectedRange]
  );
  const availabilityByDate = useMemo(
    () => summarizeDailyAvailability(availability?.slots ?? [], availability?.participantCount ?? 0),
    [availability?.participantCount, availability?.slots]
  );
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    onAvailabilityByDate?.(availabilityByDate);
  }, [availabilityByDate, onAvailabilityByDate]);

  return (
    <section className="rounded-lg border border-moss/20 bg-mist/24 p-4" aria-labelledby="group-availability-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-5 w-5 text-pine" />
            <h3 id="group-availability-heading" className="text-base font-bold text-ink">
              参加者全体の空きやすさ
            </h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink/62">予定の名前・場所・個別の空き時間は表示しません。</p>
        </div>
        {error !== accessDeniedMessage ? (
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:self-auto"
            aria-label="空き状況を更新"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            更新
          </button>
        ) : null}
      </div>

      <div className="mt-4" aria-live="polite">
        {loading ? <p className="text-sm text-ink/60">空き状況を集計しています。</p> : null}
        {error ? (
          <div className="rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink">
            <p>{error}</p>
            {errorCode === "calendar_reconnect_required" ? (
              <a href={`/api/google-calendar/connect?next=${encodeURIComponent(`/events/${eventId}/plans/new`)}`} className="mt-2 inline-flex font-bold text-pine underline underline-offset-4">
                Google Calendar を再連携
              </a>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && availability ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/82 px-3 py-1.5 text-sm font-bold text-pine">参加者 {availability.participantCount}人</span>
            {selectedAvailableCount === null ? (
              <span className="text-sm text-ink/60">日時を選ぶと、その候補で空いている人数を表示します。</span>
            ) : (
              <span className="rounded-full bg-moss/12 px-3 py-1.5 text-sm font-bold text-pine">
                選択中: 空き {selectedAvailableCount}/{availability.participantCount}人以上
              </span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
