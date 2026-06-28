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

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getCandidateEnd(candidate: AdjustmentCandidate) {
  return candidate.endAt ? new Date(candidate.endAt) : new Date(candidate.startAt);
}

function candidateDateKeys(candidate: AdjustmentCandidate) {
  const keys: string[] = [];
  const start = startOfDay(new Date(candidate.startAt));
  const end = startOfDay(getCandidateEnd(candidate));

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    keys.push(toDateKey(cursor));
  }

  return keys;
}

function groupCandidatesByDate(candidates: AdjustmentCandidate[]) {
  const grouped = new Map<string, AdjustmentCandidate[]>();

  for (const candidate of candidates) {
    for (const key of candidateDateKeys(candidate)) {
      grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
    }
  }

  for (const [key, items] of grouped) {
    grouped.set(
      key,
      [...items].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
    );
  }

  return grouped;
}

function hasOverlappingTimeRanges(candidates: AdjustmentCandidate[]) {
  const sorted = [...candidates].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousStart = new Date(previous.startAt).getTime();
    const currentStart = new Date(current.startAt).getTime();
    if (currentStart === previousStart || currentStart < getCandidateEnd(previous).getTime()) {
      return true;
    }
  }

  return false;
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
      hasOverlap: hasOverlappingTimeRanges(dayCandidates),
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
