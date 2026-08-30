import React from "react";

const SEGMENT_HOUR_LABELS = ["0", "4", "8", "12", "16", "20", "24"];

function toneClassName(maxBusyCount: number) {
  if (maxBusyCount >= 2) {
    return "bg-skywash/85";
  }
  if (maxBusyCount === 1) {
    return "bg-skywash/45";
  }
  return "bg-surface";
}

function busyCountLabel(maxBusyCount: number) {
  if (maxBusyCount >= 2) {
    return `${maxBusyCount}人が予定あり`;
  }
  if (maxBusyCount === 1) {
    return "1人が予定あり";
  }
  return "予定なし";
}

/**
 * 参加者全体の空き状況を、4時間ごと6区分の横棒で示す。個別の予定内容は持たず、
 * 区分ごとの最大同時busy人数(何人重なっているか)だけを塗り分ける。
 */
export function DailyBusyTimelineBar({ segments }: { segments: number[] }) {
  const summary = segments
    .map(
      (maxBusyCount, index) =>
        `${SEGMENT_HOUR_LABELS[index]}時〜${SEGMENT_HOUR_LABELS[index + 1]}時は${busyCountLabel(maxBusyCount)}`
    )
    .join("、");

  return (
    <div>
      <div role="img" aria-label={summary} className="flex h-7 overflow-hidden rounded-control border border-line">
        {segments.map((maxBusyCount, index) => (
          <div key={index} data-testid="timeline-segment" className={`flex-1 ${toneClassName(maxBusyCount)}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-caption text-subtle">
        {SEGMENT_HOUR_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <p className="mt-1 text-caption text-subtle">薄い色＝1人、濃い色＝複数人が重なっている</p>
    </div>
  );
}
