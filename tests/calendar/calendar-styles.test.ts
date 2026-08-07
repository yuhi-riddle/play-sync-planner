import { describe, expect, it } from "vitest";

import { dayCellClass, weekdayClass } from "@/lib/shared/calendar-styles";

function day(overrides: Partial<{ date: Date; dateKey: string; isSelected: boolean; isCurrentMonth: boolean }> = {}) {
  return {
    date: new Date(2026, 6, 15),
    dateKey: "2026-07-15",
    isSelected: false,
    isCurrentMonth: true,
    ...overrides
  };
}

describe("weekdayClass", () => {
  it("colors Sunday distinctly", () => {
    expect(weekdayClass(0)).toBe("text-clay-ink");
  });

  it("colors Saturday distinctly", () => {
    expect(weekdayClass(6)).toBe("text-sky-700");
  });

  it("uses a neutral color for weekdays", () => {
    expect(weekdayClass(3)).toBe("text-muted");
  });
});

describe("dayCellClass", () => {
  it("highlights the selected day above all other states", () => {
    expect(dayCellClass(day({ isSelected: true }))).toBe("border-pine bg-moss/18 text-ink shadow-soft");
  });

  it("mutes days outside the current month", () => {
    expect(dayCellClass(day({ isCurrentMonth: false }))).toBe("border-line bg-surface text-muted hover:border-moss/35");
  });

  it("colors a holiday like a Sunday even on a weekday", () => {
    // 2026-07-20 は海の日(祝日、月曜)
    expect(dayCellClass(day({ date: new Date(2026, 6, 20), dateKey: "2026-07-20" }))).toBe(
      "border-line bg-clay/8 text-clay-ink hover:border-clay/45"
    );
  });

  it("colors Saturday distinctly from a plain weekday", () => {
    expect(dayCellClass(day({ date: new Date(2026, 6, 18), dateKey: "2026-07-18" }))).toBe(
      "border-line bg-skywash/55 text-sky-800 hover:border-sky-300"
    );
  });

  it("uses the plain weekday style otherwise", () => {
    expect(dayCellClass(day({ date: new Date(2026, 6, 15), dateKey: "2026-07-15" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
  });
});
