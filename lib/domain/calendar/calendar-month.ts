import { toJstDateKey } from "@/lib/shared/jst";

export function parseMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, month: monthNumber };
}

export function monthParam(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function moveMonth(month: string, amount: number) {
  const { year, month: monthNumber } = parseMonth(month);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return monthParam(date.getFullYear(), date.getMonth() + 1);
}

export function defaultDateForMonth(month: string) {
  return `${month}-01`;
}

export function monthLabel(month: string) {
  const { year, month: monthNumber } = parseMonth(month);
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));
}

export function dateLabel(dateKey: string, { includeYear = false }: { includeYear?: boolean } = {}) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: includeYear ? "numeric" : undefined,
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${dateKey}T00:00:00`));
}

/** 表示中の月（"YYYY-MM"）が JST の当月と一致するか。 */
export function isDisplayingCurrentMonth(month: string, now: Date) {
  return toJstDateKey(now).slice(0, 7) === month;
}

/** 月ピッカーの年ホイールに出す年の並び。基本は当年 ±3。表示中の年が外なら含むまで伸ばす。 */
export function pickerYearRange(currentMonth: string, now: Date): number[] {
  const currentYear = Number(toJstDateKey(now).slice(0, 4));
  const shownYear = parseMonth(currentMonth).year;
  const from = Math.min(currentYear - 3, shownYear);
  const to = Math.max(currentYear + 3, shownYear);
  const years: number[] = [];
  for (let year = from; year <= to; year += 1) {
    years.push(year);
  }
  return years;
}
