import { describe, expect, it } from "vitest";

import { buildHomeCalendar, type HomeCalendarItem } from "@/lib/domain/home-calendar";

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
