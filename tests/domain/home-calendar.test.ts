import { describe, expect, it } from "vitest";

import { buildHomeCalendar, findNextConfirmedItem, type HomeCalendarItem } from "@/lib/domain/home-calendar";

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

describe("findNextConfirmedItem", () => {
  const now = new Date("2026-07-12T09:00:00+09:00");

  it("returns null when there are no confirmed items", () => {
    expect(findNextConfirmedItem([], now)).toBeNull();
  });

  it("returns null when confirmed items are all in the past", () => {
    const pastItems: HomeCalendarItem[] = [
      { id: "confirmed-past", kind: "confirmed", title: "終わった会", startAt: "2026-07-10T13:00:00+09:00" }
    ];

    expect(findNextConfirmedItem(pastItems, now)).toBeNull();
  });

  it("picks the soonest confirmed item among today and future items, ignoring collecting items", () => {
    const mixedItems: HomeCalendarItem[] = [
      { id: "collecting-1", kind: "collecting", title: "調整中の会", startAt: "2026-07-12T10:00:00+09:00" },
      { id: "confirmed-later", kind: "confirmed", title: "来週の会", startAt: "2026-07-19T13:00:00+09:00" },
      { id: "confirmed-today", kind: "confirmed", title: "今日の会", startAt: "2026-07-12T18:00:00+09:00" }
    ];

    expect(findNextConfirmedItem(mixedItems, now)?.id).toBe("confirmed-today");
  });

  it("returns the earliest of same-day confirmed items when several exist", () => {
    const sameDayItems: HomeCalendarItem[] = [
      { id: "confirmed-evening", kind: "confirmed", title: "夜の会", startAt: "2026-07-12T20:00:00+09:00" },
      { id: "confirmed-noon", kind: "confirmed", title: "昼の会", startAt: "2026-07-12T12:00:00+09:00" }
    ];

    expect(findNextConfirmedItem(sameDayItems, now)?.id).toBe("confirmed-noon");
  });
});
