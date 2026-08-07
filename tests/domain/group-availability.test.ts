import { describe, expect, it } from "vitest";

import { buildAvailabilitySlots, monthRangeInTokyo } from "@/lib/domain/plan/group-availability";

describe("group availability", () => {
  it("creates an anonymous 15 minute availability count", () => {
    const slots = buildAvailabilitySlots({
      participantCount: 2,
      busyByParticipant: [[{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:30:00+09:00" }], []],
      range: {
        start: "2026-07-15T10:00:00+09:00",
        end: "2026-07-15T10:30:00+09:00"
      }
    });

    expect(slots).toEqual([
      { start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 1 },
      { start: "2026-07-15T10:15:00+09:00", end: "2026-07-15T10:30:00+09:00", availableCount: 1 }
    ]);
  });

  it("uses complete months in Asia/Tokyo", () => {
    expect(monthRangeInTokyo("2026-07")).toEqual({
      start: "2026-07-01T00:00:00+09:00",
      end: "2026-08-01T00:00:00+09:00"
    });
  });
});
