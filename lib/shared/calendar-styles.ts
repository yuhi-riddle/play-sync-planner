import { isJapaneseHoliday } from "@/lib/domain/calendar/japanese-holidays";

export function weekdayClass(index: number) {
  if (index === 0) {
    return "text-clay-ink";
  }

  if (index === 6) {
    return "text-sky-700";
  }

  return "text-muted";
}

/**
 * 升目の面。面（背景）を敷くのは「選択日・今日・当月外」だけ。
 * 土日祝は面では区別せず、文字色（dayCellTextClass）だけで示す。
 */
export function dayCellClass(day: { isSelected: boolean; isToday: boolean; isCurrentMonth: boolean }) {
  if (day.isSelected) {
    return "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white shadow-soft";
  }

  if (day.isToday) {
    return "border-2 border-pine bg-surface text-ink hover:border-pine";
  }

  if (!day.isCurrentMonth) {
    return "border-line bg-surface text-muted hover:border-moss/35";
  }

  return "border-line bg-surface text-ink hover:border-moss/45";
}

/**
 * 曜日・祝日の文字色だけ。dayCellClass が返す面の上に重ねる。
 * 選択日（白文字）・当月外（muted）には呼び出し側で足さないこと。
 */
export function dayCellTextClass(day: { date: Date; dateKey: string }) {
  const dayIndex = day.date.getDay();

  if (dayIndex === 0 || isJapaneseHoliday(day.dateKey)) {
    return "text-clay-ink";
  }

  if (dayIndex === 6) {
    return "text-sky-800";
  }

  return "";
}
