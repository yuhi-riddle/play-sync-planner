export type HomeCalendarItemKind = "collecting" | "confirmed" | "google";

export type HomeCalendarItem = {
  id: string;
  kind: HomeCalendarItemKind;
  title: string;
  subtitle?: string | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
  isAllDay?: boolean | null;
  href?: string;
};

export type HomeCalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  itemCount: number;
  collectingCount: number;
  confirmedCount: number;
  googleCount: number;
};

export type HomeCalendar = {
  weeks: HomeCalendarDay[][];
  daysByKey: Map<string, HomeCalendarDay>;
  selectedDateKey: string;
  selectedItems: HomeCalendarItem[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toHomeDateKey(value: Date | string) {
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

function itemEndDate(item: HomeCalendarItem) {
  const end = item.endAt ? new Date(item.endAt) : new Date(item.startAt);
  if (!item.isAllDay) {
    return end;
  }

  return addDays(end, -1);
}

function itemDateKeys(item: HomeCalendarItem) {
  const keys: string[] = [];
  const start = startOfDay(new Date(item.startAt));
  const end = startOfDay(itemEndDate(item));

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    keys.push(toHomeDateKey(cursor));
  }

  return keys;
}

function kindPriority(kind: HomeCalendarItemKind) {
  if (kind === "confirmed") {
    return 0;
  }

  if (kind === "collecting") {
    return 1;
  }

  return 2;
}

function sortItems(items: HomeCalendarItem[]) {
  return [...items].sort((left, right) => {
    const timeDiff = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return kindPriority(left.kind) - kindPriority(right.kind);
  });
}

function groupItemsByDate(items: HomeCalendarItem[]) {
  const grouped = new Map<string, HomeCalendarItem[]>();

  for (const item of items) {
    for (const dateKey of itemDateKeys(item)) {
      grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), item]);
    }
  }

  for (const [dateKey, dayItems] of grouped) {
    grouped.set(dateKey, sortItems(dayItems));
  }

  return grouped;
}

export function findNextConfirmedItem(items: HomeCalendarItem[], now: Date): HomeCalendarItem | null {
  const todayStart = startOfDay(now);
  const upcomingConfirmed = items.filter(
    (item) => item.kind === "confirmed" && new Date(item.startAt) >= todayStart
  );

  if (upcomingConfirmed.length === 0) {
    return null;
  }

  return sortItems(upcomingConfirmed)[0];
}

export function buildHomeCalendar({
  year,
  month,
  selectedDateKey,
  items
}: {
  year: number;
  month: number;
  selectedDateKey: string;
  items: HomeCalendarItem[];
}): HomeCalendar {
  const grouped = groupItemsByDate(items);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay());
  const daysByKey = new Map<string, HomeCalendarDay>();
  const weeks: HomeCalendarDay[][] = [];

  for (let cursor = new Date(gridStart), index = 0; cursor <= gridEnd; cursor = addDays(cursor, 1), index += 1) {
    const dateKey = toHomeDateKey(cursor);
    const dayItems = grouped.get(dateKey) ?? [];
    const day: HomeCalendarDay = {
      date: new Date(cursor),
      dateKey,
      day: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === month - 1,
      isSelected: dateKey === selectedDateKey,
      itemCount: dayItems.length,
      collectingCount: dayItems.filter((item) => item.kind === "collecting").length,
      confirmedCount: dayItems.filter((item) => item.kind === "confirmed").length,
      googleCount: dayItems.filter((item) => item.kind === "google").length
    };

    daysByKey.set(dateKey, day);
    const weekIndex = Math.floor(index / 7);
    weeks[weekIndex] = [...(weeks[weekIndex] ?? []), day];
  }

  return {
    weeks,
    daysByKey,
    selectedDateKey,
    selectedItems: grouped.get(selectedDateKey) ?? []
  };
}
