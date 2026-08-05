import React from "react";

import { DetailsScrollIntoView } from "@/components/details-scroll-into-view";
import {
  ParticipantToggleChips,
  type TimetableParticipantOption
} from "@/components/participant-toggle-chips";

const inputClass =
  "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20";

/**
 * 進行表の追加・編集フォーム。
 * 入口は閉じた <details>。繰り返し足す軽いものなので、専用ページには飛ばさずその場で開く。
 */
export function PlanTimetableForm({
  action,
  participants,
  eventDates,
  defaultDate,
  defaultStartTime,
  summaryLabel = "＋ 進行を追加",
  submitLabel = "追加",
  defaultValues,
  idPrefix = "timetable-new"
}: {
  action: (formData: FormData) => void | Promise<void>;
  participants: TimetableParticipantOption[];
  /** 開催が何日にまたがるか。1日なら日付欄を出さない。 */
  eventDates: string[];
  defaultDate: string;
  defaultStartTime: string;
  summaryLabel?: string;
  submitLabel?: string;
  defaultValues?: {
    title?: string;
    note?: string | null;
    endTime?: string;
    assigneeIds?: string[];
  };
  /** 1ページに複数のフォームが並ぶので、label の htmlFor が衝突しないよう id を分ける。 */
  idPrefix?: string;
}) {
  const isMultiDay = eventDates.length > 1;

  return (
    <details className="rounded-control border border-line bg-surface">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-body font-bold text-pine">
        {summaryLabel}
      </summary>

      <DetailsScrollIntoView />

      <form action={action} className="space-y-4 border-t border-line px-4 py-4">
        {isMultiDay ? (
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-date`}>
              日付
            </label>
            <select id={`${idPrefix}-date`} name="date" defaultValue={defaultDate} className={inputClass}>
              {eventDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-start-time`}>
              開始
            </label>
            <input
              id={`${idPrefix}-start-time`}
              name="start_time"
              type="time"
              required
              defaultValue={defaultStartTime}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-end-time`}>
              終了（任意）
            </label>
            <input
              id={`${idPrefix}-end-time`}
              name="end_time"
              type="time"
              defaultValue={defaultValues?.endTime ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="text-caption text-muted" htmlFor={`${idPrefix}-title`}>
            進行の名前
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            type="text"
            required
            maxLength={100}
            defaultValue={defaultValues?.title ?? ""}
            placeholder="例: 海の家で集合"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-caption text-muted" htmlFor={`${idPrefix}-note`}>
            メモ（任意）
          </label>
          <textarea
            id={`${idPrefix}-note`}
            name="note"
            maxLength={500}
            rows={2}
            defaultValue={defaultValues?.note ?? ""}
            placeholder="例: 日焼け止めを塗ってから"
            className={`${inputClass} min-h-20`}
          />
        </div>

        <ParticipantToggleChips participants={participants} defaultSelectedIds={defaultValues?.assigneeIds} />

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </details>
  );
}
