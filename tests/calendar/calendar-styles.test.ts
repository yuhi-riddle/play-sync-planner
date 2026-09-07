import { describe, expect, it } from "vitest";

import { dayCellClass, dayCellTextClass, weekdayClass } from "@/lib/shared/calendar-styles";

function day(
  overrides: Partial<{ date: Date; dateKey: string; isSelected: boolean; isToday: boolean; isCurrentMonth: boolean }> = {}
) {
  return {
    date: new Date(2026, 6, 15),
    dateKey: "2026-07-15",
    isSelected: false,
    isToday: false,
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
  it("選択日は pine グラデで塗る（他のどの状態より優先）", () => {
    expect(dayCellClass(day({ isSelected: true, isToday: true }))).toBe(
      "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white shadow-soft"
    );
  });

  it("今日（選択中でない）は太い pine 枠", () => {
    expect(dayCellClass(day({ isToday: true }))).toBe("border-2 border-pine bg-surface text-ink hover:border-pine");
  });

  it("当月外の升目は muted", () => {
    expect(dayCellClass(day({ isCurrentMonth: false }))).toBe(
      "border-line bg-surface text-muted hover:border-moss/35"
    );
  });

  it("土日祝でも背景は付けず、通常の升目と同じ面にする", () => {
    // dayCellClass は曜日を見ない（面は選択日・今日・当月外だけ）
    expect(dayCellClass(day({ date: new Date(2026, 6, 18), dateKey: "2026-07-18" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
    expect(dayCellClass(day({ date: new Date(2026, 6, 20), dateKey: "2026-07-20" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
  });

  it("平日も同じ", () => {
    expect(dayCellClass(day({ dateKey: "2026-07-15" }))).toBe("border-line bg-surface text-ink hover:border-moss/45");
  });
});

describe("dayCellTextClass", () => {
  it("日曜・祝日は赤文字", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 19), dateKey: "2026-07-19" })).toBe("text-clay-ink"); // 日曜
    expect(dayCellTextClass({ date: new Date(2026, 6, 20), dateKey: "2026-07-20" })).toBe("text-clay-ink"); // 海の日(月)
  });

  it("土曜は青文字", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 18), dateKey: "2026-07-18" })).toBe("text-sky-800");
  });

  it("平日は色を足さない", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 15), dateKey: "2026-07-15" })).toBe("");
  });
});
