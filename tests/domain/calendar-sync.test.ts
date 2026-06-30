import { describe, expect, it } from "vitest";

import { buildConfirmedCalendarEvent } from "@/lib/domain/calendar-sync";

describe("buildConfirmedCalendarEvent", () => {
  it("uses the plan title, event title, location, and confirmed time range", () => {
    expect(
      buildConfirmedCalendarEvent({
        planTitle: "土曜チーム",
        eventTitle: "謎解き公演",
        locationName: "新宿",
        startAt: "2026-07-01T10:00:00+09:00",
        endAt: "2026-07-01T12:00:00+09:00"
      })
    ).toEqual({
      title: "土曜チーム - 謎解き公演",
      location: "新宿",
      start: "2026-07-01T10:00:00+09:00",
      end: "2026-07-01T12:00:00+09:00"
    });
  });

  it("falls back to the event title and a two hour duration", () => {
    expect(
      buildConfirmedCalendarEvent({
        planTitle: null,
        eventTitle: "謎解き公演",
        locationName: null,
        startAt: "2026-07-01T10:00:00+09:00",
        endAt: null
      })
    ).toEqual({
      title: "謎解き公演",
      location: null,
      start: "2026-07-01T10:00:00+09:00",
      end: "2026-07-01T12:00:00.000+09:00"
    });
  });
});
