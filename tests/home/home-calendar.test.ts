import { describe, expect, it } from "vitest";

import { buildDayAriaLabel, buildHomeCalendar, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const items: HomeCalendarItem[] = [
  {
    id: "candidate-1",
    kind: "collecting",
    title: "謎解き公演",
    subtitle: "夜の回",
    startAt: "2026-07-12T19:00:00+09:00",
    endAt: "2026-07-12T21:00:00+09:00",
    href: "/plans/plan-1"
  },
  {
    id: "confirmed-1",
    kind: "confirmed",
    title: "ボードゲーム会",
    subtitle: "確定済み",
    startAt: "2026-07-12T13:00:00+09:00",
    endAt: "2026-07-12T17:00:00+09:00",
    href: "/plans/plan-2"
  },
  {
    id: "google-1",
    kind: "google",
    title: "歯医者",
    location: "新宿",
    startAt: "2026-07-13T10:00:00+09:00",
    endAt: "2026-07-13T10:30:00+09:00"
  }
];

describe("buildHomeCalendar", () => {
  it("builds a month grid with leading and trailing days", () => {
    const calendar = buildHomeCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      items: []
    });

    expect(calendar.weeks).toHaveLength(5);
    expect(calendar.weeks[0][0].dateKey).toBe("2026-06-28");
    expect(calendar.weeks[0][3].dateKey).toBe("2026-07-01");
    expect(calendar.weeks[4][6].dateKey).toBe("2026-08-01");
  });

  it("counts Madoi and Google items separately for each day", () => {
    const calendar = buildHomeCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      items
    });

    expect(calendar.daysByKey.get("2026-07-12")).toEqual(
      expect.objectContaining({
        collectingCount: 1,
        confirmedCount: 1,
        googleCount: 0,
        itemCount: 2
      })
    );
    expect(calendar.daysByKey.get("2026-07-13")).toEqual(
      expect.objectContaining({
        collectingCount: 0,
        confirmedCount: 0,
        googleCount: 1,
        itemCount: 1
      })
    );
  });

  it("returns selected day items sorted by start time and priority", () => {
    const calendar = buildHomeCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      items
    });

    expect(calendar.selectedItems.map((item) => item.id)).toEqual(["confirmed-1", "candidate-1"]);
  });
});

describe("buildDayAriaLabel", () => {
  it("says there is nothing scheduled for an empty day", () => {
    expect(buildDayAriaLabel({ date: new Date(2026, 6, 15) })).toBe("7月15日、予定なし");
  });

  it("lists every kind of item present that day", () => {
    expect(
      buildDayAriaLabel({
        date: new Date(2026, 6, 15),
        hasCollecting: true,
        hasConfirmed: true,
        hasGoogle: true
      })
    ).toBe("7月15日、調整中の予定あり、確定した予定あり、Google Calendarの予定あり");
  });

  it("marks a holiday distinctly from a revoked share link message", () => {
    expect(buildDayAriaLabel({ date: new Date(2026, 6, 20), isHoliday: true })).toBe("7月20日(祝日)、予定なし");
  });

  it("mentions overlapping candidate times", () => {
    expect(buildDayAriaLabel({ date: new Date(2026, 6, 15), hasCollecting: true, hasOverlap: true })).toBe(
      "7月15日、調整中の予定あり、時間の重複あり"
    );
  });
});
