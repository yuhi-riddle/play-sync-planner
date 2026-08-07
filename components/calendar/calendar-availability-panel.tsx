import React from "react";
import Link from "next/link";

import { hasBusyConflict, type BusyRange } from "@/lib/domain/calendar/calendar-availability";
import { formatJstTime } from "@/lib/shared/format";
import { jstIsoFromDateTimeLocal } from "@/lib/shared/jst";

export type CalendarEventRange = BusyRange & {
  title?: string | null;
  location?: string | null;
};

/** 取得中/取得後で結果枠の高さを揃えるための最低高。 */
export const CALENDAR_RESULTS_MIN_HEIGHT_CLASS = "min-h-5";

export function CalendarAvailabilityPanel({
  connected,
  loading = false,
  error = false,
  selectedDate,
  candidateStart,
  candidateEnd,
  busyRanges
}: {
  connected: boolean;
  loading?: boolean;
  error?: boolean;
  selectedDate: string;
  candidateStart: string;
  candidateEnd: string;
  busyRanges: CalendarEventRange[];
}) {
  if (!connected) {
    return (
      <div className="rounded-control border border-moss/20 bg-mist/24 p-4">
        <p className="text-sm leading-6 text-muted">
          Google Calendarを連携すると、自分の予定を見ながら候補日時を決められます。
        </p>
        <Link href="/settings" className="mt-3 inline-flex text-sm font-bold text-pine underline underline-offset-4">
          設定で連携する
        </Link>
      </div>
    );
  }

  // candidateStart/End は <input type="datetime-local"> の生の値（オフセット無し）で、
  // ユーザーが画面で見ている JST の壁時計の時刻。busyRanges は Google Calendar 由来の
  // 絶対時刻なので、そのまま突き合わせるとサーバー描画(UTC)や JST 以外の端末で
  // 9 時間ずれ、重なっているのに警告が出なくなる。JST として絶対時刻に直してから比べる。
  const conflict = hasBusyConflict(
    { start: jstIsoFromDateTimeLocal(candidateStart), end: jstIsoFromDateTimeLocal(candidateEnd) },
    busyRanges
  );

  return (
    <div className="rounded-control border border-moss/16 bg-surface p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-ink">Google Calendarの予定</h3>
        <p className="text-xs text-muted">{selectedDate}</p>
      </div>
      <div data-testid="calendar-availability-results" className={CALENDAR_RESULTS_MIN_HEIGHT_CLASS}>
        {loading ? <p className="mt-3 text-sm text-muted">予定を取得しています。</p> : null}
        {error ? <p className="mt-3 text-sm text-clay-ink">Google Calendarの予定を取得できませんでした。</p> : null}
        {!loading && !error && busyRanges.length === 0 ? (
          <p className="mt-3 text-sm text-muted">この日の予定はありません。</p>
        ) : null}
        {!loading && !error && busyRanges.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {busyRanges.map((busyRange) => (
              <li
                key={`${busyRange.start}-${busyRange.end}-${busyRange.title ?? ""}`}
                className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                <p className="font-bold">
                  {formatJstTime(busyRange.start)} - {formatJstTime(busyRange.end)}
                </p>
                <p className="mt-1 font-bold">{busyRange.title || "予定あり"}</p>
                {busyRange.location ? <p className="mt-1 text-xs text-muted">場所: {busyRange.location}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && !error && busyRanges.length > 0 ? (
          <p className="mt-3 text-xs leading-5 text-muted">予定名と場所だけ表示しています。詳細や参加者は取得しません。</p>
        ) : null}
        {conflict ? (
          <p className="mt-3 rounded-control border border-clay/25 bg-clay/10 p-3 text-sm font-bold text-ink" aria-live="polite">
            Google Calendarの予定と重なっています。
          </p>
        ) : null}
      </div>
    </div>
  );
}
