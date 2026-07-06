import type { HomeCalendarItem, HomeCalendarItemKind } from "@/lib/domain/home-calendar";
import { toHomeDateKey } from "@/lib/domain/home-calendar";

export type HomeAgendaItem = HomeCalendarItem;

export type HomeAgendaDay = {
  date: Date;
  dateKey: string;
  label: string;
  items: HomeAgendaItem[];
};

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function itemEndDate(item: HomeAgendaItem) {
  const end = item.endAt ? new Date(item.endAt) : new Date(item.startAt);
  return item.isAllDay ? addDays(end, -1) : end;
}

function itemOverlapsDay(item: HomeAgendaItem, date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const itemStart = new Date(item.startAt);
  const itemEnd = itemEndDate(item);

  return itemStart < dayEnd && itemEnd >= dayStart;
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

function sortAgendaItems(items: HomeAgendaItem[]) {
  return [...items].sort((left, right) => {
    const diff = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
    if (diff !== 0) {
      return diff;
    }

    return kindPriority(left.kind) - kindPriority(right.kind);
  });
}

function dayLabel(date: Date, baseDate: Date) {
  const dateKey = toHomeDateKey(date);
  const baseKey = toHomeDateKey(baseDate);
  const tomorrowKey = toHomeDateKey(addDays(baseDate, 1));
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);

  if (dateKey === baseKey) {
    return `今日 ${formatted}`;
  }

  if (dateKey === tomorrowKey) {
    return `明日 ${formatted}`;
  }

  return formatted;
}

export function buildHomeAgendaDays({
  baseDate,
  items,
  dayCount = 7
}: {
  baseDate: Date;
  items: HomeAgendaItem[];
  dayCount?: number;
}): HomeAgendaDay[] {
  const start = startOfDay(baseDate);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      dateKey: toHomeDateKey(date),
      label: dayLabel(date, start),
      items: sortAgendaItems(items.filter((item) => itemOverlapsDay(item, date)))
    };
  });
}

export function buildHomeAgendaDay({
  selectedDate,
  items
}: {
  selectedDate: Date;
  items: HomeAgendaItem[];
}): HomeAgendaDay {
  return buildHomeAgendaDays({ baseDate: selectedDate, items, dayCount: 1 })[0];
}
