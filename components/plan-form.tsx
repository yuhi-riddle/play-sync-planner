"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import React from "react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";

import { TextArea } from "@/components/ui";
import { buildMonthCalendar, formatDateForInput, toDateTimeLocalValueFromParts } from "@/lib/calendar";
import { formatDateTime, toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  memo?: string | null;
  candidate_dates?: Array<{ start_at: string }>;
};

const steps = ["候補日時", "回答期限", "確認"];
const defaultCandidateTime = "19:00";
const defaultDeadlineTime = "23:45";
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = ["00", "15", "30", "45"];

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

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${value}T00:00`));
}

function TimeSelect({
  date,
  time,
  onDateChange,
  onTimeChange
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  const [hour, minute] = time.split(":");

  return (
    <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">選択中の日付</span>
        <input
          className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">時</span>
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          value={hour}
          onChange={(event) => onTimeChange(`${event.target.value}:${minute}`)}
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
  selectedDate,
  visibleMonth,
  onSelectDate,
  onChangeMonth
}: {
  selectedDate: string;
  visibleMonth: Date;
  onSelectDate: (value: string) => void;
  onChangeMonth: (value: Date) => void;
}) {
  const cells = useMemo(() => buildMonthCalendar(visibleMonth.getFullYear(), visibleMonth.getMonth()), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(visibleMonth);

  function moveMonth(amount: number) {
    onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1));
  }

  return (
    <div className="rounded-lg border border-white/75 bg-white/58 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
          aria-label="前の月"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <div className="inline-flex items-center gap-2 text-base font-bold text-ink">
          <CalendarDays aria-hidden="true" className="h-5 w-5 text-moss" />
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
          aria-label="次の月"
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

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
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              className={clsx(
                "relative flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                selected
                  ? "bg-ink text-white shadow-soft"
                  : "bg-cream/70 text-ink hover:bg-mist/60",
                !cell.isCurrentMonth && !selected && "text-ink/30",
                cell.isToday && !selected && "ring-1 ring-moss/40"
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
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
}) {
  const initialCandidateDates = plan?.candidate_dates?.length
    ? plan.candidate_dates.map((candidate) => toDateTimeLocalValue(candidate.start_at))
    : [];
  const initialCandidate = splitDateTime(initialCandidateDates[0], defaultCandidateTime);
  const initialDeadlineValue = toDateTimeLocalValue(plan?.answer_deadline_at);
  const initialDeadline = splitDateTime(initialDeadlineValue, defaultDeadlineTime);

  const [currentStep, setCurrentStep] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(toMonthDate(initialCandidate.date));
  const [candidateDate, setCandidateDate] = useState(initialCandidate.date);
  const [candidateTime, setCandidateTime] = useState(initialCandidate.time);
  const [candidateDates, setCandidateDates] = useState(initialCandidateDates);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [message, setMessage] = useState("");

  const selectedCandidate = toDateTimeLocalValueFromParts(candidateDate, candidateTime);
  const selectedDeadline = toDateTimeLocalValueFromParts(deadlineDate, deadlineTime);
  const canReview = candidateDates.length > 0 && selectedDeadline.length > 0;

  function updateCandidateDate(value: string) {
    setCandidateDate(value);
    setVisibleMonth(toMonthDate(value));
  }

  function updateDeadlineDate(value: string) {
    setDeadlineDate(value);
    setVisibleMonth(toMonthDate(value));
  }

  function addCandidateDate() {
    if (candidateDates.includes(selectedCandidate)) {
      setMessage("この候補日時はすでに追加されています。");
      return;
    }

    setCandidateDates((current) => [...current, selectedCandidate].sort());
    setMessage(`${formatDateTime(selectedCandidate)} を候補に追加しました。`);
  }

  function removeCandidateDate(value: string) {
    setCandidateDates((current) => current.filter((candidate) => candidate !== value));
    setMessage("");
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

    setCurrentStep(step);
    setMessage("");
    setVisibleMonth(toMonthDate(step === 1 ? deadlineDate : candidateDate));
  }

  return (
    <form action={action} className="grid gap-6">
      {candidateDates.map((candidateDateValue) => (
        <input key={candidateDateValue} type="hidden" name="candidateDates" value={candidateDateValue} />
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
            <p className="mt-1 text-sm leading-6 text-ink/60">カレンダーで日付を選び、15分単位で時間を決めます。</p>
          </div>
          <CalendarPicker
            selectedDate={candidateDate}
            visibleMonth={visibleMonth}
            onSelectDate={updateCandidateDate}
            onChangeMonth={setVisibleMonth}
          />
          <TimeSelect date={candidateDate} time={candidateTime} onDateChange={updateCandidateDate} onTimeChange={setCandidateTime} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addCandidateDate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              候補に追加
            </button>
            <p className="text-sm text-ink/60">選択中: {formatDateTime(selectedCandidate)}</p>
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
            selectedDate={deadlineDate}
            visibleMonth={visibleMonth}
            onSelectDate={updateDeadlineDate}
            onChangeMonth={setVisibleMonth}
          />
          <TimeSelect date={deadlineDate} time={deadlineTime} onDateChange={updateDeadlineDate} onTimeChange={setDeadlineTime} />
          <p className="rounded-lg border border-moss/20 bg-mist/28 p-3 text-sm text-ink/70">回答期限: {formatDateTime(selectedDeadline)}</p>
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

      {message ? <p className="rounded-lg border border-clay/20 bg-clay/10 p-3 text-sm font-medium text-ink">{message}</p> : null}

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

function SelectedCandidates({ candidates, onRemove }: { candidates: string[]; onRemove: (value: string) => void }) {
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
        <div key={candidate} className="flex items-center justify-between gap-3 rounded-lg border border-white/72 bg-white/70 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">候補 {index + 1}</p>
            <p className="mt-1 text-sm font-bold text-ink">{formatDateTime(candidate)}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(candidate)}
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
