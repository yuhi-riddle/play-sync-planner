import type { BusyRange } from "@/lib/domain/calendar/calendar-availability";

export type GroupAvailabilitySlot = {
  start: string;
  end: string;
  availableCount: number;
};

type TimeRange = {
  start: string;
  end: string;
};

const SLOT_MINUTES = 15;
const SLOT_MILLISECONDS = SLOT_MINUTES * 60 * 1000;

function toTime(value: string) {
  return new Date(value).getTime();
}

function formatTokyoIso(time: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+09:00`;
}

function overlaps(slot: TimeRange, busyRange: BusyRange) {
  return toTime(slot.start) < toTime(busyRange.end) && toTime(busyRange.start) < toTime(slot.end);
}

export function monthRangeInTokyo(month: string): TimeRange {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("month must be YYYY-MM");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("month must be YYYY-MM");
  }

  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const formattedMonth = String(monthNumber).padStart(2, "0");
  const formattedNextMonth = String(nextMonth).padStart(2, "0");

  return {
    start: `${year}-${formattedMonth}-01T00:00:00+09:00`,
    end: `${nextYear}-${formattedNextMonth}-01T00:00:00+09:00`
  };
}

export function buildAvailabilitySlots({
  participantCount,
  busyByParticipant,
  range
}: {
  participantCount: number;
  busyByParticipant: BusyRange[][];
  range: TimeRange;
}): GroupAvailabilitySlot[] {
  const startTime = toTime(range.start);
  const endTime = toTime(range.end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new Error("range must contain valid start and end values");
  }

  const slots: GroupAvailabilitySlot[] = [];
  for (let currentTime = startTime; currentTime < endTime; currentTime += SLOT_MILLISECONDS) {
    const slot = {
      start: formatTokyoIso(currentTime),
      end: formatTokyoIso(currentTime + SLOT_MILLISECONDS)
    };
    const busyCount = busyByParticipant.filter((busyRanges) => busyRanges.some((busyRange) => overlaps(slot, busyRange))).length;
    slots.push({ ...slot, availableCount: Math.max(0, participantCount - busyCount) });
  }

  return slots;
}
