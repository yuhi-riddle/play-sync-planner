import { describe, expect, it } from "vitest";

import { buildHomeAgendaDay, buildHomeAgendaDays, type HomeAgendaItem } from "@/lib/domain/home/home-agenda";

const items: HomeAgendaItem[] = [
  {
    id: "candidate-1",
    kind: "collecting",
    title: "謎解き公演",
    startAt: "2026-07-08T19:00:00+09:00",
    endAt: "2026-07-08T21:00:00+09:00"
  },
  {
    id: "confirmed-1",
    kind: "confirmed",
    title: "ボードゲーム会",
    startAt: "2026-07-07T13:00:00+09:00",
    endAt: "2026-07-07T17:00:00+09:00"
  },
  {
    id: "future-1",
    kind: "collecting",
    title: "来週の予定",
    startAt: "2026-07-20T13:00:00+09:00",
    endAt: "2026-07-20T15:00:00+09:00"
  }
];

describe("buildHomeAgendaDays", () => {
  it("builds seven days from the base date and includes only items in that range", () => {
    const agenda = buildHomeAgendaDays({
      baseDate: new Date("2026-07-06T09:00:00+09:00"),
      items
    });

    expect(agenda).toHaveLength(7);
    expect(agenda[0].dateKey).toBe("2026-07-06");
    expect(agenda[6].dateKey).toBe("2026-07-12");
    expect(agenda.flatMap((day) => day.items.map((item) => item.id))).toEqual(["confirmed-1", "candidate-1"]);
  });

  it("keeps items sorted by start time inside each day", () => {
    const agenda = buildHomeAgendaDays({
      baseDate: new Date("2026-07-08T09:00:00+09:00"),
      items: [
        items[0],
        {
          id: "morning",
          kind: "google",
          title: "朝の予定",
          startAt: "2026-07-08T09:00:00+09:00",
          endAt: "2026-07-08T10:00:00+09:00"
        }
      ]
    });

    expect(agenda[0].items.map((item) => item.id)).toEqual(["morning", "candidate-1"]);
  });
});

describe("buildHomeAgendaDay", () => {
  it("returns only the selected date items", () => {
    const agenda = buildHomeAgendaDay({
      selectedDate: new Date("2026-07-08T09:00:00+09:00"),
      items
    });

    expect(agenda.dateKey).toBe("2026-07-08");
    expect(agenda.items.map((item) => item.id)).toEqual(["candidate-1"]);
  });
});
