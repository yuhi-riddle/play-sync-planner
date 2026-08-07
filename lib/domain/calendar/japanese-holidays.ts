export const HOLIDAY_DATA_VALID_UNTIL = "2027-11-23";

const japaneseHolidayDates = new Set([
  "2026-01-01",
  "2026-01-12",
  "2026-02-11",
  "2026-02-23",
  "2026-03-20",
  "2026-04-29",
  "2026-05-03",
  "2026-05-04",
  "2026-05-05",
  "2026-05-06",
  "2026-07-20",
  "2026-08-11",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-10-12",
  "2026-11-03",
  "2026-11-23",
  "2027-01-01",
  "2027-01-11",
  "2027-02-11",
  "2027-02-23",
  "2027-03-21",
  "2027-03-22",
  "2027-04-29",
  "2027-05-03",
  "2027-05-04",
  "2027-05-05",
  "2027-07-19",
  "2027-08-11",
  "2027-09-20",
  "2027-09-23",
  "2027-10-11",
  "2027-11-03",
  "2027-11-23"
]);

export function isJapaneseHoliday(date: string): boolean {
  if (process.env.NODE_ENV !== "production" && date > HOLIDAY_DATA_VALID_UNTIL) {
    console.warn(`[japanese-holidays] ${date} は保持している祝日データ(${HOLIDAY_DATA_VALID_UNTIL}まで)の範囲外です。年次更新が必要な可能性があります。`);
  }

  return japaneseHolidayDates.has(date);
}
