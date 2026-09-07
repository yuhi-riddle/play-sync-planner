import { describe, expect, it } from "vitest";

import {
  dateLabel,
  defaultDateForMonth,
  isDisplayingCurrentMonth,
  monthLabel,
  monthParam,
  moveMonth,
  parseMonth,
  pickerYearRange
} from "@/lib/domain/calendar/calendar-month";

describe("parseMonth", () => {
  it("splits a YYYY-MM string into year and month", () => {
    expect(parseMonth("2026-07")).toEqual({ year: 2026, month: 7 });
  });
});

describe("monthParam", () => {
  it("pads the month to two digits", () => {
    expect(monthParam(2026, 7)).toBe("2026-07");
  });
});

describe("moveMonth", () => {
  it("moves forward across a year boundary", () => {
    expect(moveMonth("2026-12", 1)).toBe("2027-01");
  });

  it("moves backward within the same year", () => {
    expect(moveMonth("2026-07", -1)).toBe("2026-06");
  });
});

describe("defaultDateForMonth", () => {
  it("returns the first day of the month", () => {
    expect(defaultDateForMonth("2026-07")).toBe("2026-07-01");
  });
});

describe("monthLabel", () => {
  it("formats the month in Japanese", () => {
    expect(monthLabel("2026-07")).toBe("2026年7月");
  });
});

describe("dateLabel", () => {
  it("omits the year by default", () => {
    expect(dateLabel("2026-07-15")).toBe("7月15日(水)");
  });

  it("includes the year when asked", () => {
    expect(dateLabel("2026-07-15", { includeYear: true })).toBe("2026年7月15日(水)");
  });
});

describe("isDisplayingCurrentMonth", () => {
  it("表示中の月が JST 当月と一致すれば true", () => {
    expect(isDisplayingCurrentMonth("2026-07", new Date("2026-07-15T12:00:00+09:00"))).toBe(true);
  });

  it("別の月なら false", () => {
    expect(isDisplayingCurrentMonth("2026-09", new Date("2026-07-15T12:00:00+09:00"))).toBe(false);
  });

  it("JST 深夜（UTC では前月）でも JST 基準で判定する", () => {
    // JST 2026-08-01 00:30 = UTC 2026-07-31 15:30
    expect(isDisplayingCurrentMonth("2026-08", new Date("2026-07-31T15:30:00Z"))).toBe(true);
  });
});

describe("pickerYearRange", () => {
  it("当年 −3〜+3 の7年を返す", () => {
    expect(pickerYearRange("2026-07", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2023, 2024, 2025, 2026, 2027, 2028, 2029
    ]);
  });

  it("表示中の年が範囲より先なら、その年まで伸ばす", () => {
    expect(pickerYearRange("2031-01", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031
    ]);
  });

  it("表示中の年が範囲より前なら、その年から始める", () => {
    expect(pickerYearRange("2020-01", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029
    ]);
  });
});
