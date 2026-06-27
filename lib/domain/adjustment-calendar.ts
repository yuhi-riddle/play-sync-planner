export type AdjustmentCandidate = {
  id: string;
  planId: string;
  eventTitle: string;
  planTitle: string | null;
  startAt: string;
  endAt?: string | null;
  status: string;
  yes: number;
  maybe: number;
  no: number;
  unanswered: number;
};

export type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  candidateCount: number;
  hasOverlap: boolean;
  hasConfirmed: boolean;
  hasCollecting: boolean;
};

export type AdjustmentCalendar = {
  weeks: CalendarDay[][];
  daysByKey: Map<string, CalendarDay>;
  selectedDateKey: string;
  selectedCandidates: AdjustmentCandidate[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toTimeKey(value: string) {
  const date = new Date(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function groupCandidatesByDate(candidates: AdjustmentCandidate[]) {
  const grouped = new Map<string, AdjustmentCandidate[]>();

  for (const candidate of candidates) {
    const key = toDateKey(candidate.startAt);
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  for (const [key, items] of grouped) {
    grouped.set(
      key,
      [...items].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
    );
  }

  return grouped;
}

function hasOverlappingStartTimes(candidates: AdjustmentCandidate[]) {
  const timeCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const timeKey = toTimeKey(candidate.startAt);
    timeCounts.set(timeKey, (timeCounts.get(timeKey) ?? 0) + 1);
  }

  return [...timeCounts.values()].some((count) => count > 1);
}

export function buildAdjustmentCalendar({
  year,
  month,
  selectedDateKey,
  candidates
}: {
  year: number;
  month: number;
  selectedDateKey: string;
  candidates: AdjustmentCandidate[];
}): AdjustmentCalendar {
  const grouped = groupCandidatesByDate(candidates);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay());
  const daysByKey = new Map<string, CalendarDay>();
  const weeks: CalendarDay[][] = [];

  for (let cursor = new Date(gridStart), index = 0; cursor <= gridEnd; cursor = addDays(cursor, 1), index += 1) {
    const dateKey = toDateKey(cursor);
    const dayCandidates = grouped.get(dateKey) ?? [];
    const day: CalendarDay = {
      date: new Date(cursor),
      dateKey,
      day: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === month - 1,
      isSelected: dateKey === selectedDateKey,
      candidateCount: dayCandidates.length,
      hasOverlap: hasOverlappingStartTimes(dayCandidates),
      hasConfirmed: dayCandidates.some((candidate) => candidate.status === "date_confirmed"),
      hasCollecting: dayCandidates.some((candidate) => candidate.status === "collecting_answers" || candidate.status === "draft")
    };

    daysByKey.set(dateKey, day);
    const weekIndex = Math.floor(index / 7);
    weeks[weekIndex] = [...(weeks[weekIndex] ?? []), day];
  }

  return {
    weeks,
    daysByKey,
    selectedDateKey,
    selectedCandidates: grouped.get(selectedDateKey) ?? []
  };
}
