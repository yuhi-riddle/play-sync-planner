import { describe, expect, it } from "vitest";

import { buildAdjustmentCalendar } from "@/lib/domain/adjustment-calendar";

const baseCandidates = [
  {
    id: "c1",
    planId: "p1",
    eventTitle: "謎解きA",
    planTitle: "土曜昼",
    startAt: "2026-07-12T13:00:00+09:00",
    status: "collecting_answers",
    yes: 2,
    maybe: 1,
    no: 0,
    unanswered: 1
  },
  {
    id: "c2",
    planId: "p2",
    eventTitle: "謎解きB",
    planTitle: "別候補",
    startAt: "2026-07-12T13:00:00+09:00",
    status: "collecting_answers",
    yes: 1,
    maybe: 0,
    no: 1,
    unanswered: 2
  },
  {
    id: "c3",
    planId: "p3",
    eventTitle: "飲み会C",
    planTitle: "夜",
    startAt: "2026-07-21T19:30:00+09:00",
    status: "date_confirmed",
    yes: 4,
    maybe: 0,
    no: 0,
    unanswered: 0
  }
] as const;

describe("buildAdjustmentCalendar", () => {
  it("builds a month grid with leading and trailing days", () => {
    const calendar = buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      candidates: []
    });

    expect(calendar.weeks).toHaveLength(5);
    expect(calendar.weeks[0][0].dateKey).toBe("2026-06-28");
    expect(calendar.weeks[0][3].dateKey).toBe("2026-07-01");
    expect(calendar.weeks[4][6].dateKey).toBe("2026-08-01");
  });

  it("marks days that have overlapping candidate times", () => {
    const calendar = buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      candidates: [...baseCandidates]
    });

    const july12 = calendar.daysByKey.get("2026-07-12");
    expect(july12?.candidateCount).toBe(2);
    expect(july12?.hasOverlap).toBe(true);
    expect(july12?.hasConfirmed).toBe(false);
  });

  it("returns selected day candidates sorted by time", () => {
    const calendar = buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-21",
      candidates: [...baseCandidates]
    });

    expect(calendar.selectedDateKey).toBe("2026-07-21");
    expect(calendar.selectedCandidates).toEqual([
      expect.objectContaining({
        eventTitle: "飲み会C",
        status: "date_confirmed"
      })
    ]);
  });
});
