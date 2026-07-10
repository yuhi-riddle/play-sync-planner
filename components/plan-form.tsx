"use client";

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import React from "react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";

import { CalendarAvailabilityPanel, type CalendarEventRange } from "@/components/calendar-availability-panel";
import { GroupAvailabilityCalendar } from "@/components/group-availability-calendar";
import { MadoiSelect, TextArea } from "@/components/ui";
import { buildMonthCalendar, formatDateForInput, toDateTimeLocalValueFromParts } from "@/lib/calendar";
import { busyCountByDate, busyRangesForDate } from "@/lib/domain/calendar-availability";
import { formatDateTime, formatDateTimeRange, toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  plan_reminder_settings?:
    | Array<{ reminder_offset_minutes: number | null; reminder_offsets_minutes?: number[] | null }>
    | { reminder_offset_minutes: number | null; reminder_offsets_minutes?: number[] | null }
    | null;
  memo?: string | null;
  candidate_dates?: Array<{ start_at: string; end_at?: string | null; is_all_day?: boolean | null }>;
};

type CandidateDraft = {
  start: string;
  end: string;
  isAllDay: boolean;
};

type ReminderDraft = {
  id: string;
  amount: string;
  unit: string;
};

const steps = ["候補日時", "回答期限", "リマインド", "確認"];
const defaultCandidateTime = "19:00";
const defaultDurationMinutes = 120;
const defaultDeadlineTime = "23:45";
const defaultReminderOffset = "1440";
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
const nazotokiTemplateTimes = ["10:00", "13:00", "16:00", "19:00"];
const reminderUnitOptions = [
  { value: "minutes", label: "分前" },
  { value: "hours", label: "時間前" },
  { value: "days", label: "日前" }
];
const reminderUnitMultipliers: Record<string, number> = {
  minutes: 1,
  hours: 60,
  days: 1440
};

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

function reminderPartsFromMinutes(minutes: number) {
  if (Number.isFinite(minutes) && minutes > 0 && minutes % reminderUnitMultipliers.days === 0) {
    return { amount: String(minutes / reminderUnitMultipliers.days), unit: "days" };
  }

  if (Number.isFinite(minutes) && minutes > 0 && minutes % reminderUnitMultipliers.hours === 0) {
    return { amount: String(minutes / reminderUnitMultipliers.hours), unit: "hours" };
  }

  return { amount: Number.isFinite(minutes) && minutes > 0 ? String(minutes) : "1", unit: "minutes" };
}

function initialReminderOffsetValues(settings: PlanRecord["plan_reminder_settings"]) {
  const setting = Array.isArray(settings) ? settings[0] : settings;
  if (!setting) {
    return [Number(defaultReminderOffset)];
  }

  if (setting.reminder_offsets_minutes?.length) {
    return setting.reminder_offsets_minutes;
  }

  return setting.reminder_offset_minutes === null ? [] : [setting.reminder_offset_minutes];
}

function initialReminderParts(settings: PlanRecord["plan_reminder_settings"]) {
  const offsets = initialReminderOffsetValues(settings);
  return {
    enabled: offsets.length > 0,
    drafts:
      offsets.length > 0
        ? offsets.map((minutes, index) => ({ id: `initial-${index}`, ...reminderPartsFromMinutes(minutes) }))
        : [{ id: "initial-0", amount: "1", unit: "days" }]
  };
}

function reminderDraftOffsetValue(draft: ReminderDraft) {
  const normalizedAmount = Math.max(1, Math.floor(Number(draft.amount) || 0));
  return normalizedAmount * (reminderUnitMultipliers[draft.unit] ?? 1);
}

function reminderOffsetValues(enabled: boolean, drafts: ReminderDraft[]) {
  if (!enabled) {
    return [];
  }

  return Array.from(new Set(drafts.map(reminderDraftOffsetValue))).sort((a, b) => b - a);
}

function reminderDraftLabel(draft: ReminderDraft) {
  const unitLabel = reminderUnitOptions.find((option) => option.value === draft.unit)?.label ?? "分前";
  return `${Math.max(1, Math.floor(Number(draft.amount) || 0))}${unitLabel}`;
}

function reminderTimingTitle(draft: ReminderDraft) {
  return `回答期限の${reminderDraftLabel(draft)}`;
}

function reminderOffsetLabel(enabled: boolean, drafts: ReminderDraft[]) {
  if (!enabled) {
    return "設定しない";
  }

  return drafts.map(reminderDraftLabel).join(" / ");
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
  busyCounts = {},
  availabilityByDate = {},
  rangeStartDate,
  rangeEndDate,
  onSelectRange,
  onSelectComplete
}: {
  label?: string;
  selectedDate: string;
  visibleMonth: Date;
  onSelectDate: (value: string) => void;
  onChangeMonth: (value: Date) => void;
  minDate?: string;
  busyCounts?: Record<string, number>;
  availabilityByDate?: Record<string, { averageAvailableCount: number; participantCount: number }>;
  rangeStartDate?: string;
  rangeEndDate?: string;
  onSelectRange?: (start: string, end: string) => void;
  onSelectComplete?: () => void;
}) {
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [dragStartDate, setDragStartDate] = useState<string | null>(null);
  const [dragEndDate, setDragEndDate] = useState<string | null>(null);
  const dragMovedRef = useRef(false);
  const cells = useMemo(() => buildMonthCalendar(visibleMonth.getFullYear(), visibleMonth.getMonth()), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(visibleMonth);
  const yearOptions = Array.from({ length: 11 }, (_, index) => visibleMonth.getFullYear() - 5 + index);
  const activeRangeStart = dragStartDate && dragEndDate ? minDateValue(dragStartDate, dragEndDate) : rangeStartDate;
  const activeRangeEnd = dragStartDate && dragEndDate ? maxDateValue(dragStartDate, dragEndDate) : rangeEndDate;

  function moveMonth(amount: number) {
    onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1));
  }

  return (
    <div role="group" aria-label={label} className="rounded-lg border border-moss/16 bg-cream/72 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
          aria-label="前の月"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setMonthPickerOpen((open) => !open)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-base font-bold text-ink transition-colors hover:bg-mist/45 focus:outline-none focus:ring-2 focus:ring-clay"
          aria-expanded={monthPickerOpen}
        >
          <CalendarDays aria-hidden="true" className="h-5 w-5 text-moss" />
          {monthLabel}
        </button>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
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
          const inRange = Boolean(activeRangeStart && activeRangeEnd && cell.date >= activeRangeStart && cell.date <= activeRangeEnd);
          const rangeEdge = Boolean(inRange && (cell.date === activeRangeStart || cell.date === activeRangeEnd));
          const holidayColor = cell.isHoliday || cell.dayOfWeek === 0;
          const saturdayColor = cell.dayOfWeek === 6;
          const disabled = Boolean(minDate && cell.date < minDate);
          const dailyAvailability = availabilityByDate[cell.date];
          const availabilityRatio = dailyAvailability ? dailyAvailability.averageAvailableCount / dailyAvailability.participantCount : 0;
          const availabilityTone =
            availabilityRatio >= 0.8 ? "bg-moss/20" : availabilityRatio >= 0.5 ? "bg-skywash/72" : availabilityRatio > 0 ? "bg-clay/12" : null;
          const availabilityLabel = dailyAvailability
            ? `、平均 空き ${dailyAvailability.averageAvailableCount}/${dailyAvailability.participantCount}人`
            : "";
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => {
                if (disabled) {
                  return;
                }
                if (onSelectRange) {
                  if (dragMovedRef.current) {
                    dragMovedRef.current = false;
                    return;
                  }
                  onSelectRange(cell.date, cell.date);
                  onSelectComplete?.();
                  return;
                }
                onSelectDate(cell.date);
              }}
              onPointerDown={(event) => {
                if (!onSelectRange || disabled) {
                  return;
                }
                setDragStartDate(cell.date);
                setDragEndDate(cell.date);
                dragMovedRef.current = false;
                onSelectRange(cell.date, cell.date);
              }}
              onPointerEnter={() => {
                if (!onSelectRange || !dragStartDate || disabled) {
                  return;
                }
                if (cell.date !== dragStartDate) {
                  dragMovedRef.current = true;
                }
                setDragEndDate(cell.date);
                onSelectRange(minDateValue(dragStartDate, cell.date), maxDateValue(dragStartDate, cell.date));
              }}
              onPointerUp={() => {
                if (!onSelectRange || !dragStartDate) {
                  return;
                }
                setDragStartDate(null);
                setDragEndDate(null);
                onSelectComplete?.();
              }}
              disabled={disabled}
              className={clsx(
                "relative flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                rangeEdge || selected ? "bg-ink text-white shadow-soft" : inRange ? "bg-mist/62 text-ink ring-1 ring-moss/18" : availabilityTone ?? "bg-cream/70 text-ink hover:bg-mist/60",
                !selected && !rangeEdge && holidayColor && "text-red-700",
                !selected && !rangeEdge && !holidayColor && saturdayColor && "text-blue-700",
                !cell.isCurrentMonth && !selected && !rangeEdge && "text-ink/30",
                cell.isToday && !selected && !rangeEdge && "ring-1 ring-moss/40",
                disabled && "pointer-events-none bg-cream/35 text-ink/20 line-through"
              )}
              aria-pressed={selected}
              aria-label={`${formatDateLabel(cell.date)}を選択${availabilityLabel}`}
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

function minDateValue(left: string, right: string) {
  return left <= right ? left : right;
}

function maxDateValue(left: string, right: string) {
  return left >= right ? left : right;
}

export function PlanForm({
  action,
  plan,
  submitLabel,
  eventCategory,
  eventId,
  calendarAvailability
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
  eventCategory?: string | null;
  eventId?: string;
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
  const initialReminder = initialReminderParts(plan?.plan_reminder_settings);
  const candidateHourRef = useRef<HTMLButtonElement>(null);
  const deadlineHourRef = useRef<HTMLButtonElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const skipInitialStepScroll = useRef(true);
  const reminderDraftSequence = useRef(initialReminder.drafts.length);
  const today = formatDateForInput(new Date());

  const [currentStep, setCurrentStep] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(toMonthDate(initialCandidate.date));
  const [candidateDate, setCandidateDate] = useState(initialCandidate.date);
  const [candidateStartTime, setCandidateStartTime] = useState(initialCandidate.time);
  const [candidateEndDate, setCandidateEndDate] = useState(initialCandidateEnd.date);
  const [candidateEndTime, setCandidateEndTime] = useState(initialCandidateEnd.time);
  const [candidateIsAllDay, setCandidateIsAllDay] = useState(initialCandidateDates[0]?.isAllDay ?? false);
  const [candidateDates, setCandidateDates] = useState<CandidateDraft[]>(initialCandidateDates);
  const [deadlineDate, setDeadlineDate] = useState(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [reminderEnabled, setReminderEnabled] = useState(initialReminder.enabled);
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraft[]>(initialReminder.drafts);
  const [message, setMessage] = useState("");
  const [busyRanges, setBusyRanges] = useState<CalendarEventRange[]>([]);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState(false);
  const [groupAvailabilityByDate, setGroupAvailabilityByDate] = useState<
    Record<string, { averageAvailableCount: number; participantCount: number }>
  >({});

  const visibleMonthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
  const calendarConnected = Boolean(calendarAvailability?.enabled);
  const showPersonalAvailability = calendarConnected && !eventId;
  const busyCounts = useMemo(() => busyCountByDate(busyRanges), [busyRanges]);
  const selectedDayBusyRanges = useMemo(
    () => busyRangesForDate(busyRanges, candidateDate),
    [busyRanges, candidateDate]
  );
  const selectedAllDayRange = allDayRangeForDate(candidateDate);
  const selectedCandidateStart = candidateIsAllDay ? selectedAllDayRange.start : toDateTimeLocalValueFromParts(candidateDate, candidateStartTime);
  const selectedCandidateEnd = candidateIsAllDay ? selectedAllDayRange.end : toDateTimeLocalValueFromParts(candidateEndDate, candidateEndTime);
  const selectedDeadline = toDateTimeLocalValueFromParts(deadlineDate, deadlineTime);
  const reminderOffsetsMinutes = reminderOffsetValues(reminderEnabled, reminderDrafts);
  const firstCandidate = candidateDates[0]?.start;
  const deadlineIsTooLate =
    Boolean(firstCandidate) && new Date(selectedDeadline).getTime() >= new Date(firstCandidate ?? "").getTime();
  const candidateIsPast = new Date(selectedCandidateStart).getTime() < Date.now();
  const candidateEndIsInvalid = !candidateIsAllDay && new Date(selectedCandidateEnd).getTime() <= new Date(selectedCandidateStart).getTime();
  const canReview = candidateDates.length > 0 && selectedDeadline.length > 0 && !deadlineIsTooLate;

  useEffect(() => {
    if (!showPersonalAvailability) {
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
  }, [showPersonalAvailability, visibleMonthKey]);

  useEffect(() => {
    if (skipInitialStepScroll.current) {
      skipInitialStepScroll.current = false;
      return;
    }

    window.setTimeout(() => {
      const target = stepHeadingRef.current;
      if (!target) {
        return;
      }

      const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      target.focus({ preventScroll: true });
    }, 0);
  }, [currentStep]);

  function updateCandidateDate(value: string) {
    setCandidateDate(value);
    setCandidateEndDate((currentEndDate) => (currentEndDate === candidateDate || currentEndDate < value ? value : currentEndDate));
    setVisibleMonth(toMonthDate(value));
    focusWithSmoothScroll(candidateHourRef);
  }

  function updateCandidateRange(start: string, end: string) {
    setCandidateDate(start);
    setCandidateEndDate(end);
    setVisibleMonth(toMonthDate(start));
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
    focusWithSmoothScroll(candidateHourRef);
  }

  function updateReminderDraft(id: string, values: Partial<Pick<ReminderDraft, "amount" | "unit">>) {
    setReminderDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...values } : draft)));
  }

  function addReminderDraft() {
    const nextId = reminderDraftSequence.current;
    reminderDraftSequence.current += 1;
    setReminderDrafts((current) => [...current, { id: `reminder-${nextId}`, amount: "1", unit: "hours" }]);
    setReminderEnabled(true);
  }

  function removeReminderDraft(id: string) {
    setReminderDrafts((current) => {
      const nextDrafts = current.filter((draft) => draft.id !== id);
      return nextDrafts.length > 0 ? nextDrafts : [{ id: "fallback-0", amount: "1", unit: "days" }];
    });
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
      <input type="hidden" name="reminder_offset_minutes" value={reminderOffsetsMinutes[0] ?? ""} />
      {reminderOffsetsMinutes.map((offsetMinutes) => (
        <input key={offsetMinutes} type="hidden" name="reminder_offsets_minutes" value={String(offsetMinutes)} />
      ))}

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
              候補日時を選ぶ
            </h2>
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
            availabilityByDate={groupAvailabilityByDate}
            rangeStartDate={candidateDate}
            rangeEndDate={candidateEndDate}
            onSelectRange={updateCandidateRange}
            onSelectComplete={() => focusWithSmoothScroll(candidateHourRef)}
          />
          {eventId ? (
            <GroupAvailabilityCalendar
              eventId={eventId}
              visibleMonth={visibleMonthKey}
              selectedRange={{ start: selectedCandidateStart, end: selectedCandidateEnd }}
              onAvailabilityByDate={setGroupAvailabilityByDate}
            />
          ) : (
            <CalendarAvailabilityPanel
              connected={calendarConnected}
              loading={busyLoading}
              error={busyError}
              selectedDate={candidateDate}
              candidateStart={selectedCandidateStart}
              candidateEnd={selectedCandidateEnd}
              busyRanges={selectedDayBusyRanges}
            />
          )}
          <label className="flex items-center gap-3 rounded-lg border border-moss/16 bg-cream/72 px-4 py-3 text-sm font-bold text-ink">
            <input
              type="checkbox"
              aria-label="終日"
                checked={candidateIsAllDay}
                onChange={(event) => {
                  setCandidateIsAllDay(event.target.checked);
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
            </div>
          </div>
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
            <p className="rounded-full bg-mist/38 px-3 py-2 text-sm font-bold text-pine">
              選択中: {formatDateTimeRange(selectedCandidateStart, selectedCandidateEnd, candidateIsAllDay)}
            </p>
          </div>
          <SelectedCandidates candidates={candidateDates} onRemove={removeCandidateDate} />
        </section>
      ) : null}

        {currentStep === 1 ? (
          <section className="grid gap-5">
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
                回答期限を選ぶ
            </h2>
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
            {deadlineIsTooLate ? "回答期限は最初の候補日時より前にしてください。" : `回答期限: ${formatDateTime(selectedDeadline)}`}
          </p>
        </section>
      ) : null}

      {currentStep === 2 ? (
        <section className="grid gap-5">
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
              リマインドを決める
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">回答していない人に、回答期限前の通知を作ります。</p>
          </div>
          <div className="rounded-lg border border-moss/16 bg-cream/72 p-4">
            <label className="flex items-center gap-3 text-sm font-bold text-ink">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(event) => setReminderEnabled(event.currentTarget.checked)}
                className="h-5 w-5 rounded border-ink/20 text-moss focus:ring-clay"
              />
              回答期限前にリマインドする
            </label>
            <div className={clsx("mt-3 grid gap-3", !reminderEnabled && "opacity-45")}>
              {reminderDrafts.map((draft, index) => (
                <div key={draft.id} className="grid gap-3 rounded-lg border border-moss/12 bg-cream/72 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="text-sm font-medium text-ink">
                    <span className="text-ink/72">{reminderTimingTitle(draft)}</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={draft.amount}
                      disabled={!reminderEnabled}
                      onChange={(event) => updateReminderDraft(draft.id, { amount: event.currentTarget.value.replace(/[^\d]/g, "") })}
                      className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-cream/90 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20 disabled:bg-cream/45"
                      aria-label={`${reminderTimingTitle(draft)} 数値`}
                    />
                  </label>
                  <label className="text-sm font-medium text-ink">
                    <span className="text-ink/72">単位</span>
                    <div className="mt-2">
                      <MadoiSelect
                        value={draft.unit}
                        onValueChange={(unit) => updateReminderDraft(draft.id, { unit })}
                        options={reminderUnitOptions}
                        fieldLabel={`${reminderTimingTitle(draft)} 単位`}
                        ariaLabel={`${reminderTimingTitle(draft)} 単位`}
                        compact
                      />
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeReminderDraft(draft.id)}
                    disabled={!reminderEnabled || reminderDrafts.length === 1}
                    className="inline-flex h-11 w-11 items-center justify-center self-end rounded-full border border-ink/10 bg-cream/82 text-ink/60 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay disabled:pointer-events-none disabled:opacity-40"
                    aria-label={`${reminderTimingTitle(draft)} を削除`}
                    title="削除"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addReminderDraft}
                disabled={!reminderEnabled}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-ink/10 bg-cream/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                リマインドを追加
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {currentStep === 3 ? (
        <section className="grid gap-5">
          <div>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold text-ink outline-none">
              内容を確認する
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">共有リンクを作る前に、候補日時、回答期限、リマインドを確認します。</p>
          </div>
          <div className="grid gap-3">
            <ReviewBlock title="候補日時" actionLabel="候補日時を修正" onEdit={() => moveToStep(0)}>
              <SelectedCandidates candidates={candidateDates} onRemove={removeCandidateDate} />
            </ReviewBlock>
            <ReviewBlock title="回答期限" actionLabel="回答期限を修正" onEdit={() => moveToStep(1)}>
              <p className="text-base font-bold text-ink">{formatDateTime(selectedDeadline)}</p>
            </ReviewBlock>
            <ReviewBlock title="リマインド" actionLabel="リマインドを修正" onEdit={() => moveToStep(2)}>
              <p className="text-base font-bold text-ink">{reminderOffsetLabel(reminderEnabled, reminderDrafts)}</p>
              <p className="mt-1 text-sm text-ink/58">イベント開始前の通知は、日程確定後に扱います。</p>
            </ReviewBlock>
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

        {currentStep < 3 ? (
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
        <div key={candidate.start} className="flex items-center justify-between gap-3 rounded-lg border border-moss/12 bg-cream/72 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">候補 {index + 1}</p>
            <p className="mt-1 text-sm font-bold text-ink">{formatDateTimeRange(candidate.start, candidate.end, candidate.isAllDay)}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(candidate.start)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-cream/82 text-ink/60 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay"
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

function ReviewBlock({
  title,
  actionLabel,
  onEdit,
  children
}: {
  title: string;
  actionLabel: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-moss/16 bg-cream/72 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">{title}</p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink/10 bg-cream/82 px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}
