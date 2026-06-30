export type BusyRange = {
  start: string;
  end: string;
};

function toTime(value: string) {
  return new Date(value).getTime();
}

function toDateKey(value: string) {
  return value.slice(0, 10);
}

export function rangesOverlap(left: BusyRange, right: BusyRange): boolean {
  return toTime(left.start) < toTime(right.end) && toTime(right.start) < toTime(left.end);
}

export function hasBusyConflict(candidate: BusyRange, busyRanges: BusyRange[]): boolean {
  return busyRanges.some((busyRange) => rangesOverlap(candidate, busyRange));
}

export function busyCountByDate<T extends BusyRange>(busyRanges: T[]): Record<string, number> {
  return busyRanges.reduce<Record<string, number>>((result, busyRange) => {
    const key = toDateKey(busyRange.start);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

export function busyRangesForDate<T extends BusyRange>(busyRanges: T[], dateKey: string): T[] {
  return busyRanges.filter((busyRange) => toDateKey(busyRange.start) === dateKey);
}
