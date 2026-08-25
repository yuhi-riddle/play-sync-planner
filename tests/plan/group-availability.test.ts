import { describe, expect, it } from "vitest";

import { buildAvailabilitySlots, buildDailyBusySummaries, monthRangeInTokyo } from "@/lib/domain/plan/group-availability";

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

describe("buildDailyBusySummaries", () => {
  it("予定が無い日は maxBusyCount も allDayBusyCount も0", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [[], []],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 0, allDayBusyCount: 0 });
  });

  it("一人だけ一部の時間帯に予定があると maxBusyCount は1", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T10:00:00+09:00", end: "2026-08-01T11:00:00+09:00" }],
        []
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 0 });
  });

  it("同じ時間帯に複数人の予定が重なると maxBusyCount がその人数になる", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T10:00:00+09:00", end: "2026-08-01T11:00:00+09:00" }],
        [{ start: "2026-08-01T10:30:00+09:00", end: "2026-08-01T11:30:00+09:00" }]
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"].maxBusyCount).toBe(2);
  });

  it("一人の予定がその日24時間ぶん連続していると allDayBusyCount が1増える", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }],
        []
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 1 });
  });

  it("月の範囲すべての日付がキーとして存在する", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [[]],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-04T00:00:00+09:00" }
    });

    expect(Object.keys(result)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
});
