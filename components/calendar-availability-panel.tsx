import React from "react";
import Link from "next/link";

import { hasBusyConflict, type BusyRange } from "@/lib/domain/calendar-availability";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

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
  busyRanges: BusyRange[];
}) {
  if (!connected) {
    return (
      <div className="rounded-lg border border-moss/20 bg-mist/24 p-4">
        <p className="text-sm leading-6 text-ink/68">
          Google Calendarを連携すると、自分の予定と重なる候補に気づきやすくなります。
        </p>
        <Link href="/settings" className="mt-3 inline-flex text-sm font-bold text-pine underline underline-offset-4">
          設定で連携する
        </Link>
      </div>
    );
  }

  const conflict = hasBusyConflict({ start: candidateStart, end: candidateEnd }, busyRanges);

  return (
    <div className="rounded-lg border border-white/75 bg-white/58 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-ink">Google Calendarの予定</h3>
        <p className="text-xs text-ink/50">{selectedDate}</p>
      </div>
      {loading ? <p className="mt-3 text-sm text-ink/60">予定を取得しています。</p> : null}
      {error ? <p className="mt-3 text-sm text-clay">Google Calendarの予定を取得できませんでした。</p> : null}
      {!loading && !error && busyRanges.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">この日の予定はありません。</p>
      ) : null}
      {!loading && !error && busyRanges.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {busyRanges.map((busyRange) => (
            <li
              key={`${busyRange.start}-${busyRange.end}`}
              className="rounded-lg border border-ink/8 bg-cream/72 px-3 py-2 text-sm font-bold text-ink"
            >
              {formatTime(busyRange.start)} - {formatTime(busyRange.end)}
            </li>
          ))}
        </ul>
      ) : null}
      {conflict ? (
        <p className="mt-3 rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm font-bold text-ink" aria-live="polite">
          Google Calendarの予定と重なっています。
        </p>
      ) : null}
    </div>
  );
}
