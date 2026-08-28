"use client";

import { RefreshCw, Users } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useState } from "react";

type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
  segments: number[];
};

type AvailabilityResponse = {
  month: string;
  updatedAt: string;
  /** カレンダーを連携している人数。空きの計算はこの人数を母数にする。 */
  connectedCount: number;
  /** イベントの参加者総数。連携していない人もここには入る。 */
  memberCount: number;
  dailyBusySummaries: Record<string, DailyBusySummary>;
};

type AvailabilityErrorResponse = { error?: string; code?: string };
const accessDeniedMessage = "日程調整中の主催者だけが空き状況を集計できます。";

/** 取得中/取得後でaria-liveブロックの高さを揃えるための最低高。 */
export const AVAILABILITY_STATUS_MIN_HEIGHT_CLASS = "min-h-5";

/**
 * availability がまだ無い間の既定値。`?? {}` を直接書くとレンダーのたびに
 * 新しいオブジェクトができ、それを依存配列に持つ useEffect が毎回発火して
 * 親の setState → 再レンダー → 新しい {} … と無限ループになる。
 */
const EMPTY_DAILY_BUSY_SUMMARIES: Record<string, DailyBusySummary> = {};

export function GroupAvailabilityCalendar({
  eventId,
  visibleMonth,
  onAvailabilityByDate,
  onConnectionStatus
}: {
  eventId: string;
  visibleMonth: string;
  onAvailabilityByDate?: (availabilityByDate: Record<string, DailyBusySummary>) => void;
  onConnectionStatus?: (status: { connectedCount: number; memberCount: number }) => void;
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

  const dailyBusySummaries = availability?.dailyBusySummaries ?? EMPTY_DAILY_BUSY_SUMMARIES;
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    onAvailabilityByDate?.(dailyBusySummaries);
  }, [dailyBusySummaries, onAvailabilityByDate]);

  useEffect(() => {
    if (!availability) {
      return;
    }
    onConnectionStatus?.({ connectedCount: availability.connectedCount, memberCount: availability.memberCount });
  }, [availability, onConnectionStatus]);

  return (
    <section className="rounded-control border border-moss/20 bg-mist/24 p-4" aria-labelledby="group-availability-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-5 w-5 text-pine" />
            <h3 id="group-availability-heading" className="text-base font-bold text-ink">
              参加者全体の空き状況
            </h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">予定の名前・場所・個別の空き時間は表示しません。</p>
        </div>
        {error !== accessDeniedMessage ? (
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:self-auto"
            aria-label="空き状況を更新"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            更新
          </button>
        ) : null}
      </div>

      <div className={`mt-4 ${AVAILABILITY_STATUS_MIN_HEIGHT_CLASS}`} aria-live="polite">
        {loading ? <p className="text-sm text-muted">空き状況を集計しています。</p> : null}
        {error ? (
          <div className="rounded-control border border-clay/25 bg-clay/10 p-3 text-sm text-ink">
            <p>{error}</p>
            {errorCode === "calendar_reconnect_required" ? (
              <a href={`/api/google-calendar/connect?next=${encodeURIComponent(`/events/${eventId}/plans/new`)}`} className="mt-2 inline-flex font-bold text-pine underline underline-offset-4">
                Google Calendar を再連携
              </a>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && availability ? (
          availability.connectedCount === 0 ? (
            /* 誰も連携していないと集計するものが無い。空きゼロと紛らわしいので、はっきり分ける。 */
            <p className="text-sm leading-6 text-muted">
              カレンダーを連携している参加者がまだいません。候補日時を出して、回答を集めてください。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {/*
               * 分母は必ず出す。連携している人数を書かずに「空き8人」とだけ見せると、
               * 連携していない人まで空いていると読めてしまう。
               */}
              <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold text-pine">
                参加者 {availability.memberCount}人中 {availability.connectedCount}人分のカレンダー
              </span>
              {availability.connectedCount < availability.memberCount ? (
                <span className="w-full text-sm leading-6 text-muted">
                  未連携の{availability.memberCount - availability.connectedCount}人はこの集計に入っていません。空いているかどうかは回答で確かめてください。
                </span>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
