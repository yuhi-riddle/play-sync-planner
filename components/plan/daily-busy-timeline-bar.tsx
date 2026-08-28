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

/**
 * 参加者全体の空き状況を、4時間ごと6区分の横棒で示す。個別の予定内容は持たず、
 * 区分ごとの最大同時busy人数(何人重なっているか)だけを塗り分ける。
 */
export function DailyBusyTimelineBar({ segments }: { segments: number[] }) {
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded-control border border-line">
        {segments.map((maxBusyCount, index) => (
          <div key={index} data-testid="timeline-segment" className={`flex-1 ${toneClassName(maxBusyCount)}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-caption text-subtle">
        {SEGMENT_HOUR_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
