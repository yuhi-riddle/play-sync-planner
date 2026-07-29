import { isJapaneseHoliday } from "@/lib/japanese-holidays";

export function weekdayClass(index: number) {
  if (index === 0) {
    return "text-clay-ink";
  }

  if (index === 6) {
    return "text-sky-700";
  }

  return "text-muted";
}

export function dayCellClass(day: { date: Date; dateKey: string; isSelected: boolean; isCurrentMonth: boolean }) {
  const dayIndex = day.date.getDay();
  const isHoliday = isJapaneseHoliday(day.dateKey);

  if (day.isSelected) {
    return "border-pine bg-moss/18 text-ink shadow-soft";
  }

  if (!day.isCurrentMonth) {
    return "border-line bg-surface text-muted hover:border-moss/35";
  }

  if (dayIndex === 0 || isHoliday) {
    return "border-line bg-clay/8 text-clay-ink hover:border-clay/45";
  }

  if (dayIndex === 6) {
    return "border-line bg-skywash/55 text-sky-800 hover:border-sky-300";
  }

  return "border-line bg-surface text-ink hover:border-moss/45";
}
