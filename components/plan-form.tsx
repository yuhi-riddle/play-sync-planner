"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import React from "react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

import { CalendarAvailabilityPanel, type CalendarEventRange } from "@/components/calendar-availability-panel";
import { MadoiSelect, TextArea } from "@/components/ui";
import { buildMonthCalendar, formatDateForInput, toDateTimeLocalValueFromParts } from "@/lib/calendar";
import { busyCountByDate, busyRangesForDate } from "@/lib/domain/calendar-availability";
import { formatDateTime, formatDateTimeRange, toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  plan_reminder_settings?: Array<{ reminder_offset_minutes: number | null }> | { reminder_offset_minutes: number | null } | null;
  memo?: string | null;
  candidate_dates?: Array<{ start_at: string; end_at?: string | null; is_all_day?: boolean | null }>;
};

type CandidateDraft = {
  start: string;
  end: string;
  isAllDay: boolean;
};

const steps = ["候補日時", "回答期限", "確認"];
const defaultCandidateTime = "19:00";
const defaultDurationMinutes = 120;
const defaultDeadlineTime = "23:45";
const defaultReminderOffset = "1440";
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
const nazotokiTemplateTimes = ["10:00", "13:00", "16:00", "19:00"];
const reminderOptions = [
  { value: "", label: "設定しない" },
  { value: "180", label: "3時間前" },
  { value: "1440", label: "1日前" },
  { value: "2880", label: "2日前" }
];

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

function addDaysToDateValue(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function allDayRangeForDate(dateValue: string) {
  return {
    start: toDateTimeLocalValueFromParts(dateValue, "00:00"),
    end: toDateTimeLocalValueFromParts(addDaysToDateValue(dateValue, 1), "00:00")
  };
}

function focusWithSmoothScroll(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    const target = ref.current;
    if (!target) {
      return;
    }

    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, 0);
}

function initialReminderOffsetValue(settings: PlanRecord["plan_reminder_settings"]) {
  const setting = Array.isArray(settings) ? settings[0] : settings;
  if (!setting) {
    return defaultReminderOffset;
  }

  return setting.reminder_offset_minutes === null ? "" : String(setting.reminder_offset_minutes);
}

function reminderOffsetLabel(value: string) {
  return reminderOptions.find((option) => option.value === value)?.label ?? "設定しない";
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
  hourRef?: RefObject<HTMLButtonElement | null>;
  labelPrefix: string;
}) {
  const [hour, minute] = time.split(":");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">時</span>
        <div className="mt-2">
          <MadoiSelect
            value={hour}
            onValueChange={(nextHour) => onTimeChange(`${nextHour}:${minute}`)}
            options={hourOptions.map((option) => ({ value: option, label: option }))}
            fieldLabel={`${labelPrefix}時`}
            ariaLabel={`${labelPrefix}時`}
            buttonRef={hourRef}
          />
        </div>
      </label>
      <label className="text-sm font-medium text-ink">
        <span className="text-ink/72">分</span>
        <div className="mt-2">
          <MadoiSelect
            value={minute}
            onValueChange={(nextMinute) => onTimeChange(`${hour}:${nextMinute}`)}
            options={minuteOptions.map((option) => ({ value: option, label: option }))}
            fieldLabel={`${labelPrefix}分`}
            ariaLabel={`${labelPrefix}分`}
          />
        </div>
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
  minDate,
  busyCounts = {}
}: {
  label?: string;
  selectedDate: string;
  visibleMonth: Date;
  onSelectDate: (value: string) => void;
  onChangeMonth: (value: Date) => void;
  minDate?: string;
  busyCounts?: Record<string, number>;
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
            <div className="mt-2">
              <MadoiSelect
                value={String(visibleMonth.getFullYear())}
                onValueChange={(year) => onChangeMonth(new Date(Number(year), visibleMonth.getMonth(), 1))}
                options={yearOptions.map((year) => ({ value: String(year), label: `${year}年` }))}
                fieldLabel="年"
                ariaLabel="年を選択"
                compact
              />
            </div>
          </label>
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">月</span>
            <div className="mt-2">
              <MadoiSelect
                value={String(visibleMonth.getMonth())}
                onValueChange={(month) => onChangeMonth(new Date(visibleMonth.getFullYear(), Number(month), 1))}
                options={Array.from({ length: 12 }, (_, month) => ({ value: String(month), label: `${month + 1}月` }))}
                fieldLabel="月"
                ariaLabel="月を選択"
                compact
              />
            </div>
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
                selected ? "bg-ink text-white shadow-soft" : "bg-cream/70 text-ink hover:bg-mist/60",
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
              {busyCounts[cell.date] ? (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
              ) : null}
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
  eventCategory,
  calendarAvailability
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
  eventCategory?: string | null;
  calendarAvailability?: { enabled: boolean };
}) {
  const initialCandidateDates = plan?.candidate_dates?.length
    ? plan.candidate_dates.map((candidate) => ({
        start: toDateTimeLocalValue(candidate.start_at),
        end: toDateTimeLocalValue(candidate.end_at),
        isAllDay: Boolean(candidate.is_all_day)
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
  const initialReminderOffset = initialReminderOffsetValue(plan?.plan_reminder_settings);
  const candidateHourRef = useRef<HTMLButtonElement>(null);
  const deadlineHourRef = useRef<HTMLButtonElement>(null);
  const today = formatDateForInput(new Date());

  const [currentStep, setCurrentStep] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(toMonthDate(initialCandidate.date));
  const [candidateDate, setCandidateDate] = useState(initialCandidate.date);
  const [candidateStartTime, setCandidateStartTime] = useState(initialCandidate.time);
  const [candidateEndDate, setCandidateEndDate] = useState(initialCandidateEnd.date);
  const [candidateEndTime, setCandidateEndTime] = useState(initialCandidateEnd.time);
  const [candidateIsAllDay, setCandidateIsAllDay] = useState(initialCandidateDates[0]?.isAllDay ?? false);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [candidateDates, setCandidateDates] = useState<CandidateDraft[]>(initialCandidateDates);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState(initialReminderOffset);
  const [message, setMessage] = useState("");
  const [busyRanges, setBusyRanges] = useState<CalendarEventRange[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState(false);

  const visibleMonthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
  const calendarConnected = Boolean(calendarAvailability?.enabled);
  const busyCounts = useMemo(() => busyCountByDate(busyRanges), [busyRanges]);
  const selectedDayBusyRanges = useMemo(
    () => busyRangesForDate(busyRanges, candidateDate),
    [busyRanges, candidateDate]
  );
  const selectedAllDayRange = allDayRangeForDate(candidateDate);
  const selectedCandidateStart = candidateIsAllDay ? selectedAllDayRange.start : toDateTimeLocalValueFromParts(candidateDate, candidateStartTime);
  const selectedCandidateEnd = candidateIsAllDay ? selectedAllDayRange.end : toDateTimeLocalValueFromParts(candidateEndDate, candidateEndTime);
  const selectedDeadline = toDateTimeLocalValueFromParts(deadlineDate, deadlineTime);
  const firstCandidate = candidateDates[0]?.start;
  const deadlineIsTooLate =
    Boolean(firstCandidate) && new Date(selectedDeadline).getTime() >= new Date(firstCandidate ?? "").getTime();
  const candidateIsPast = new Date(selectedCandidateStart).getTime() < Date.now();
  const candidateEndIsInvalid = !candidateIsAllDay && new Date(selectedCandidateEnd).getTime() <= new Date(selectedCandidateStart).getTime();
  const canReview = candidateDates.length > 0 && selectedDeadline.length > 0 && !deadlineIsTooLate;

  useEffect(() => {
    if (!calendarConnected) {
      setBusyRanges([]);
      return;
    }

    let cancelled = false;
    setBusyLoading(true);
    setBusyError(false);

    fetch(`/api/google-calendar/freebusy?month=${visibleMonthKey}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("calendar events failed");
        }
        return response.json() as Promise<{ connected: boolean; busy: CalendarEventRange[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setBusyRanges(data.busy);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBusyError(true);
          setBusyRanges([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusyLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [calendarConnected, visibleMonthKey]);

  function updateCandidateDate(value: string) {
    setCandidateDate(value);
    setCandidateEndDate((currentEndDate) => (currentEndDate === candidateDate || currentEndDate < value ? value : currentEndDate));
    setVisibleMonth(toMonthDate(value));
    focusWithSmoothScroll(candidateHourRef);
  }

  function updateCandidateEndDate(value: string) {
    setCandidateEndDate(value);
    setVisibleMonth(toMonthDate(value));
    setEndDatePickerOpen(false);
  }

  function updateDeadlineDate(value: string) {
    setDeadlineDate(value);
    setVisibleMonth(toMonthDate(value));
    focusWithSmoothScroll(deadlineHourRef);
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

    setCandidateDates((current) =>
      [...current, { start: selectedCandidateStart, end: selectedCandidateEnd, isAllDay: candidateIsAllDay }].sort((left, right) =>
        left.start.localeCompare(right.start)
      )
    );
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
    setCandidateIsAllDay(false);
    setEndDatePickerOpen(false);
    focusWithSmoothScroll(candidateHourRef);
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
          <input type="hidden" name="candidateAllDays" value={String(candidateDateValue.isAllDay)} />
        </React.Fragment>
      ))}
      <input type="hidden" name="answer_deadline_at" value={selectedDeadline} />
      <input type="hidden" name="reminder_offset_minutes" value={reminderOffsetMinutes} />

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
            busyCounts={busyCounts}
          />
          <CalendarAvailabilityPanel
            connected={calendarConnected}
            loading={busyLoading}
            error={busyError}
            selectedDate={candidateDate}
            candidateStart={selectedCandidateStart}
            candidateEnd={selectedCandidateEnd}
            busyRanges={selectedDayBusyRanges}
          />
          <label className="flex items-center gap-3 rounded-lg border border-white/75 bg-white/58 px-4 py-3 text-sm font-bold text-ink">
            <input
              type="checkbox"
              aria-label="終日"
              checked={candidateIsAllDay}
              onChange={(event) => {
                setCandidateIsAllDay(event.target.checked);
                if (event.target.checked) {
                  setEndDatePickerOpen(false);
                }
              }}
              className="h-5 w-5 rounded border-ink/20 text-moss focus:ring-clay"
            />
            終日
          </label>
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
          {candidateIsPast ? (
            <p className="rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
              過去の日時は候補にできません。
            </p>
          ) : null}
          {candidateEndIsInvalid ? (
            <p className="rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
              終了時間は開始時間より後にしてください。
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addCandidateDate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              候補に追加
            </button>
            <p className="text-sm text-ink/60">選択中: {formatDateTimeRange(selectedCandidateStart, selectedCandidateEnd, candidateIsAllDay)}</p>
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
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">リマインド</span>
            <div className="mt-2">
              <MadoiSelect
                value={reminderOffsetMinutes}
                onValueChange={setReminderOffsetMinutes}
                options={reminderOptions}
                fieldLabel="リマインド"
                ariaLabel="リマインド"
              />
            </div>
          </label>
          <p
            className={clsx(
              "rounded-lg border p-3 text-sm",
              deadlineIsTooLate ? "border-clay/25 bg-clay/10 text-ink" : "border-moss/20 bg-mist/28 text-ink/70"
            )}
            aria-live="polite"
          >
            {deadlineIsTooLate ? "回答期限は最初の候補日時より前にしてください。" : `回答期限: ${formatDateTime(selectedDeadline)}`}
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
            <p className="mt-1 text-sm text-ink/60">リマインド: {reminderOffsetLabel(reminderOffsetMinutes)}</p>
          </div>
          <TextArea label="メモ" name="memo" defaultValue={plan?.memo} placeholder="集合場所や補足があれば入力します。" />
        </section>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-clay/20 bg-clay/10 p-3 text-sm font-medium text-ink" aria-live="polite">
          {message}
        </p>
      ) : null}

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
            <p className="mt-1 text-sm font-bold text-ink">{formatDateTimeRange(candidate.start, candidate.end, candidate.isAllDay)}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(candidate.start)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/76 text-ink/60 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label={`候補 ${index + 1} を削除`}
            title="削除"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
