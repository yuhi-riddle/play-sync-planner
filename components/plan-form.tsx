"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import React from "react";
import type { RefObject } from "react";
import { useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

import { TextArea } from "@/components/ui";
import { buildMonthCalendar, formatDateForInput, toDateTimeLocalValueFromParts } from "@/lib/calendar";
import { formatDateTime, formatDateTimeRange, toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  memo?: string | null;
  candidate_dates?: Array<{ start_at: string; end_at?: string | null }>;
};

type CandidateDraft = {
  start: string;
  end: string;
};

const steps = ["候補日時", "回答期限", "確認"];
const defaultCandidateTime = "19:00";
const defaultDurationMinutes = 120;
const defaultDeadlineTime = "23:45";
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
const nazotokiTemplateTimes = ["10:00", "13:00", "16:00", "19:00"];

function splitDateTime(value: string | null | undefined, fallbackTime: string) {
  if (!value) {
    return {
      date: formatDateForInput(new Date()),
      time: fallbackTime
    };
  }

  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16) || fallbackTime
  };
}

function toMonthDate(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMinutes(dateTime: string, minutes: number) {
  const date = new Date(dateTime);
  date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${value}T00:00`));
}

function TimeSelect({
  time,
  onTimeChange,
  hourRef,
  labelPrefix
}: {
  time: string;
  onTimeChange: (value: string) => void;
  hourRef?: RefObject<HTMLSelectElement | null>;
  labelPrefix: string;
}) {
  const [hour, minute] = time.split(":");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">時</span>
        <select
          ref={hourRef}
          className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          value={hour}
          onChange={(event) => onTimeChange(`${event.target.value}:${minute}`)}
          aria-label={`${labelPrefix}時`}
        >
          {hourOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">分</span>
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          value={minute}
          onChange={(event) => onTimeChange(`${hour}:${event.target.value}`)}
          aria-label={`${labelPrefix}分`}
        >
          {minuteOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CalendarPicker({
  label = "日付を選択",
  selectedDate,
  visibleMonth,
  onSelectDate,
  onChangeMonth,
  minDate
}: {
  label?: string;
  selectedDate: string;
  visibleMonth: Date;
  onSelectDate: (value: string) => void;
  onChangeMonth: (value: Date) => void;
  minDate?: string;
}) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const cells = useMemo(() => buildMonthCalendar(visibleMonth.getFullYear(), visibleMonth.getMonth()), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(visibleMonth);
  const yearOptions = Array.from({ length: 11 }, (_, index) => visibleMonth.getFullYear() - 5 + index);

  function moveMonth(amount: number) {
    onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1));
  }

  return (
    <div role="group" aria-label={label} className="rounded-lg border border-white/75 bg-white/58 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
          aria-label="前の月"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setMonthPickerOpen((open) => !open)}
          className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-base font-bold text-ink transition-colors hover:bg-mist/45 focus:outline-none focus:ring-2 focus:ring-clay"
          aria-expanded={monthPickerOpen}
        >
          <CalendarDays aria-hidden="true" className="h-5 w-5 text-moss" />
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
          aria-label="次の月"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      {monthPickerOpen ? (
        <div className="mb-3 grid gap-2 rounded-lg border border-moss/18 bg-cream/70 p-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">年</span>
            <select
              className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              value={visibleMonth.getFullYear()}
              onChange={(event) => onChangeMonth(new Date(Number(event.target.value), visibleMonth.getMonth(), 1))}
              aria-label="年を選択"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}年
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">月</span>
            <select
              className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              value={visibleMonth.getMonth()}
              onChange={(event) => onChangeMonth(new Date(visibleMonth.getFullYear(), Number(event.target.value), 1))}
              aria-label="月を選択"
            >
              {Array.from({ length: 12 }, (_, month) => (
                <option key={month} value={month}>
                  {month + 1}月
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink/52">
        {["日", "月", "火", "水", "木", "金", "土"].map((weekday) => (
          <div key={weekday} className="py-2">
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const selected = cell.date === selectedDate;
          const holidayColor = cell.isHoliday || cell.dayOfWeek === 0;
          const saturdayColor = cell.dayOfWeek === 6;
          const disabled = Boolean(minDate && cell.date < minDate);
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              disabled={disabled}
              className={clsx(
                "relative flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                selected
                  ? "bg-ink text-white shadow-soft"
                  : "bg-cream/70 text-ink hover:bg-mist/60",
                !selected && holidayColor && "text-red-700",
                !selected && !holidayColor && saturdayColor && "text-blue-700",
                !cell.isCurrentMonth && !selected && "text-ink/30",
                cell.isToday && !selected && "ring-1 ring-moss/40",
                disabled && "pointer-events-none bg-white/36 text-ink/20 line-through"
              )}
              aria-pressed={selected}
              aria-label={`${formatDateLabel(cell.date)}を選択`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PlanForm({
  action,
  plan,
  submitLabel,
  eventCategory
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
  eventCategory?: string | null;
}) {
  const initialCandidateDates = plan?.candidate_dates?.length
    ? plan.candidate_dates.map((candidate) => ({
        start: toDateTimeLocalValue(candidate.start_at),
        end: toDateTimeLocalValue(candidate.end_at)
      }))
    : [];
  const initialCandidate = splitDateTime(initialCandidateDates[0]?.start, defaultCandidateTime);
  const initialCandidateEnd = splitDateTime(
    initialCandidateDates[0]?.end ||
      addMinutes(toDateTimeLocalValueFromParts(initialCandidate.date, initialCandidate.time), defaultDurationMinutes),
    "21:00"
  );
  const initialDeadlineValue = toDateTimeLocalValue(plan?.answer_deadline_at);
  const initialDeadline = splitDateTime(initialDeadlineValue, defaultDeadlineTime);
  const candidateHourRef = useRef<HTMLSelectElement>(null);
  const deadlineHourRef = useRef<HTMLSelectElement>(null);
  const today = formatDateForInput(new Date());

  const [currentStep, setCurrentStep] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(toMonthDate(initialCandidate.date));
  const [candidateDate, setCandidateDate] = useState(initialCandidate.date);
  const [candidateStartTime, setCandidateStartTime] = useState(initialCandidate.time);
  const [candidateEndDate, setCandidateEndDate] = useState(initialCandidateEnd.date);
  const [candidateEndTime, setCandidateEndTime] = useState(initialCandidateEnd.time);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [candidateDates, setCandidateDates] = useState<CandidateDraft[]>(initialCandidateDates);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [message, setMessage] = useState("");

  const selectedCandidateStart = toDateTimeLocalValueFromParts(candidateDate, candidateStartTime);
  const selectedCandidateEnd = toDateTimeLocalValueFromParts(candidateEndDate, candidateEndTime);
  const selectedDeadline = toDateTimeLocalValueFromParts(deadlineDate, deadlineTime);
  const firstCandidate = candidateDates[0]?.start;
  const deadlineIsTooLate =
    Boolean(firstCandidate) && new Date(selectedDeadline).getTime() >= new Date(firstCandidate ?? "").getTime();
  const candidateIsPast = new Date(selectedCandidateStart).getTime() < Date.now();
  const candidateEndIsInvalid = new Date(selectedCandidateEnd).getTime() <= new Date(selectedCandidateStart).getTime();
  const canReview = candidateDates.length > 0 && selectedDeadline.length > 0 && !deadlineIsTooLate;

  function updateCandidateDate(value: string) {
    setCandidateDate(value);
    setCandidateEndDate((currentEndDate) => (currentEndDate === candidateDate || currentEndDate < value ? value : currentEndDate));
    setVisibleMonth(toMonthDate(value));
    window.setTimeout(() => candidateHourRef.current?.focus(), 0);
  }

  function updateCandidateEndDate(value: string) {
    setCandidateEndDate(value);
    setVisibleMonth(toMonthDate(value));
    setEndDatePickerOpen(false);
  }

  function updateDeadlineDate(value: string) {
    setDeadlineDate(value);
    setVisibleMonth(toMonthDate(value));
    window.setTimeout(() => deadlineHourRef.current?.focus(), 0);
  }

  function addCandidateDate() {
    if (candidateIsPast) {
      setMessage("過去の日時は候補にできません。");
      return;
    }

    if (candidateEndIsInvalid) {
      setMessage("終了時間は開始時間より後にしてください。");
      return;
    }

    if (candidateDates.some((candidate) => candidate.start === selectedCandidateStart)) {
      setMessage("この候補日時はすでに追加されています。");
      return;
    }

    setCandidateDates((current) => [...current, { start: selectedCandidateStart, end: selectedCandidateEnd }].sort((left, right) => left.start.localeCompare(right.start)));
    setMessage(`${formatDateTime(selectedCandidateStart)} を候補に追加しました。`);
  }

  function removeCandidateDate(value: string) {
    setCandidateDates((current) => current.filter((candidate) => candidate.start !== value));
    setMessage("");
  }

  function applyTemplateTime(time: string) {
    const start = toDateTimeLocalValueFromParts(candidateDate, time);
    const end = splitDateTime(addMinutes(start, defaultDurationMinutes), "12:00");
    setCandidateStartTime(time);
    setCandidateEndDate(end.date);
    setCandidateEndTime(end.time);
    setEndDatePickerOpen(false);
    window.setTimeout(() => candidateHourRef.current?.focus(), 0);
  }

  function moveToStep(step: number) {
    if (step === 1 && candidateDates.length === 0) {
      setMessage("候補日時を1つ以上追加してください。");
      return;
    }

    if (step === 2 && selectedDeadline.length === 0) {
      setMessage("回答期限を選択してください。");
      return;
    }

    if (step === 2 && deadlineIsTooLate) {
      setMessage("");
      return;
    }

    setCurrentStep(step);
    setMessage("");
    setVisibleMonth(toMonthDate(step === 1 ? deadlineDate : candidateDate));
  }

  return (
    <form action={action} className="grid gap-6">
      {candidateDates.map((candidateDateValue) => (
        <React.Fragment key={candidateDateValue.start}>
          <input type="hidden" name="candidateDates" value={candidateDateValue.start} />
          <input type="hidden" name="candidateEndDates" value={candidateDateValue.end} />
        </React.Fragment>
      ))}
      <input type="hidden" name="answer_deadline_at" value={selectedDeadline} />

      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className={clsx(
              "rounded-lg border px-4 py-3 text-sm font-bold",
              currentStep === index
                ? "border-moss bg-mist/35 text-pine"
                : index < currentStep
                  ? "border-moss/20 bg-white/68 text-ink"
                  : "border-white/70 bg-white/46 text-ink/50"
            )}
          >
            <span className="mr-2 text-xs tabular-nums">STEP {index + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      {currentStep === 0 ? (
        <section className="grid gap-5">
          <div>
            <h2 className="text-xl font-bold text-ink">候補日時を選ぶ</h2>
          </div>
          {eventCategory === "nazotoki" ? (
            <div className="rounded-lg border border-moss/20 bg-mist/24 p-3">
              <p className="text-sm font-bold text-ink">謎解きテンプレート</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {nazotokiTemplateTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => applyTemplateTime(time)}
                    className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    {time}〜
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <CalendarPicker
            label="候補日を選択"
            selectedDate={candidateDate}
            visibleMonth={visibleMonth}
            onSelectDate={updateCandidateDate}
            onChangeMonth={setVisibleMonth}
            minDate={today}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-ink">開始時間</p>
              <TimeSelect time={candidateStartTime} onTimeChange={setCandidateStartTime} hourRef={candidateHourRef} labelPrefix="開始" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">終了時間</p>
              <TimeSelect time={candidateEndTime} onTimeChange={setCandidateEndTime} labelPrefix="終了" />
              <button
                type="button"
                onClick={() => {
                  setEndDatePickerOpen((open) => !open);
                  setVisibleMonth(toMonthDate(candidateEndDate));
                }}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/78 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                aria-expanded={endDatePickerOpen}
              >
                終了日を変更
              </button>
            </div>
          </div>
          {endDatePickerOpen ? (
            <div className="grid gap-2">
              <p className="text-sm font-bold text-ink">終了日</p>
              <CalendarPicker
                label="終了日を選択"
                selectedDate={candidateEndDate}
                visibleMonth={visibleMonth}
                onSelectDate={updateCandidateEndDate}
                onChangeMonth={setVisibleMonth}
                minDate={candidateDate}
              />
            </div>
          ) : null}
          {candidateIsPast ? <p className="rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">過去の日時は候補にできません。</p> : null}
          {candidateEndIsInvalid ? <p className="rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">終了時間は開始時間より後にしてください。</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addCandidateDate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              候補に追加
            </button>
            <p className="text-sm text-ink/60">
              選択中: {formatDateTimeRange(selectedCandidateStart, selectedCandidateEnd)}
            </p>
          </div>
          <SelectedCandidates candidates={candidateDates} onRemove={removeCandidateDate} />
        </section>
      ) : null}

      {currentStep === 1 ? (
        <section className="grid gap-5">
          <div>
            <h2 className="text-xl font-bold text-ink">回答期限を選ぶ</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">参加者に回答してほしい締め切りを選びます。</p>
          </div>
          <CalendarPicker
            label="回答期限の日付を選択"
            selectedDate={deadlineDate}
            visibleMonth={visibleMonth}
            onSelectDate={updateDeadlineDate}
            onChangeMonth={setVisibleMonth}
            minDate={today}
          />
          <TimeSelect time={deadlineTime} onTimeChange={setDeadlineTime} hourRef={deadlineHourRef} labelPrefix="回答期限" />
          <p
            className={clsx(
              "rounded-lg border p-3 text-sm",
              deadlineIsTooLate ? "border-clay/25 bg-clay/10 text-ink" : "border-moss/20 bg-mist/28 text-ink/70"
            )}
            aria-live="polite"
          >
            {deadlineIsTooLate
              ? "回答期限は最初の候補日時より前にしてください。"
              : `回答期限: ${formatDateTime(selectedDeadline)}`}
          </p>
        </section>
      ) : null}

      {currentStep === 2 ? (
        <section className="grid gap-5">
          <div>
            <h2 className="text-xl font-bold text-ink">内容を確認する</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">候補日時と回答期限を確認して、共有リンクを作ります。</p>
          </div>
          <SelectedCandidates candidates={candidateDates} onRemove={removeCandidateDate} />
          <div className="rounded-lg border border-moss/20 bg-mist/28 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">回答期限</p>
            <p className="mt-2 text-base font-bold text-ink">{formatDateTime(selectedDeadline)}</p>
          </div>
          <TextArea label="メモ" name="memo" defaultValue={plan?.memo} placeholder="集合場所や補足があれば入力します。" />
        </section>
      ) : null}

      {message ? <p className="rounded-lg border border-clay/20 bg-clay/10 p-3 text-sm font-medium text-ink" aria-live="polite">{message}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => moveToStep(Math.max(currentStep - 1, 0))}
          disabled={currentStep === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/10 bg-white/82 px-5 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          戻る
        </button>

        {currentStep < 2 ? (
          <button
            type="button"
            onClick={() => moveToStep(currentStep + 1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            次へ
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canReview}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
          >
            {submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

function SelectedCandidates({ candidates, onRemove }: { candidates: CandidateDraft[]; onRemove: (value: string) => void }) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-moss/30 bg-white/54 p-4 text-sm text-ink/62">
        候補日時はまだ追加されていません。
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {candidates.map((candidate, index) => (
        <div key={candidate.start} className="flex items-center justify-between gap-3 rounded-lg border border-white/72 bg-white/70 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">候補 {index + 1}</p>
            <p className="mt-1 text-sm font-bold text-ink">
              {formatDateTimeRange(candidate.start, candidate.end)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(candidate.start)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/76 text-ink/60 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label={`候補${index + 1}を削除`}
            title="削除"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
