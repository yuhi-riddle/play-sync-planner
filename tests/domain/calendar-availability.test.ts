import { describe, expect, it } from "vitest";

import {
  busyCountByDate,
  busyRangesForDate,
  hasBusyConflict,
  rangesOverlap
} from "@/lib/domain/calendar/calendar-availability";

const busy = [
  { start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" },
  { start: "2026-07-01T13:00:00+09:00", end: "2026-07-01T14:00:00+09:00" },
  { start: "2026-07-02T09:00:00+09:00", end: "2026-07-02T10:00:00+09:00" }
];

describe("calendar availability", () => {
  it("detects overlapping ranges", () => {
    expect(
      rangesOverlap(
        { start: "2026-07-01T10:30:00+09:00", end: "2026-07-01T11:30:00+09:00" },
        busy[0]
      )
    ).toBe(true);
  });

  it("does not treat touching endpoints as overlap", () => {
    expect(
      rangesOverlap(
        { start: "2026-07-01T11:00:00+09:00", end: "2026-07-01T12:00:00+09:00" },
        busy[0]
      )
    ).toBe(false);
  });

  it("detects whether a candidate conflicts with any busy range", () => {
    expect(
      hasBusyConflict(
        { start: "2026-07-01T12:30:00+09:00", end: "2026-07-01T13:30:00+09:00" },
        busy
      )
    ).toBe(true);
  });

  it("counts busy ranges by local date", () => {
    expect(busyCountByDate(busy)).toEqual({
      "2026-07-01": 2,
      "2026-07-02": 1
    });
  });

  it("filters busy ranges for a selected date", () => {
    expect(busyRangesForDate(busy, "2026-07-01")).toHaveLength(2);
    expect(busyRangesForDate(busy, "2026-07-03")).toEqual([]);
  });
});
