import { describe, expect, it } from "vitest";

import { dateLabel, defaultDateForMonth, monthLabel, monthParam, moveMonth, parseMonth } from "@/lib/domain/calendar-month";

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
