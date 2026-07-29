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
