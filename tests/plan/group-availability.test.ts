import { describe, expect, it } from "vitest";

import {
  buildAvailabilitySlots,
  buildDailyBusySummaries,
  DAILY_BUSY_TIMELINE_SEGMENT_COUNT,
  DAILY_BUSY_TIMELINE_SEGMENT_HOURS,
  monthRangeInTokyo
} from "@/lib/domain/plan/group-availability";

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

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 0, allDayBusyCount: 0, segments: [0, 0, 0, 0, 0, 0] });
  });

  it("一人だけ一部の時間帯に予定があると maxBusyCount は1", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T10:00:00+09:00", end: "2026-08-01T11:00:00+09:00" }],
        []
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 0, segments: [0, 0, 1, 0, 0, 0] });
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

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 1, segments: [1, 1, 1, 1, 1, 1] });
  });

  it("月の範囲すべての日付がキーとして存在する", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [[]],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-04T00:00:00+09:00" }
    });

    expect(Object.keys(result)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("日次集計に、4時間×6区分ごとの最大同時busy人数を含む", () => {
    const summaries = buildDailyBusySummaries({
      busyByParticipant: [
        // 参加者A: 10:00〜11:00 busy(区分2=8〜12時)
        [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T11:00:00+09:00" }],
        // 参加者B: 10:30〜11:30 busy(区分2=8〜12時、Aと重なる) + 14:00〜15:00 busy(区分3=12〜16時、単独)
        [
          { start: "2026-07-15T10:30:00+09:00", end: "2026-07-15T11:30:00+09:00" },
          { start: "2026-07-15T14:00:00+09:00", end: "2026-07-15T15:00:00+09:00" }
        ]
      ],
      range: { start: "2026-07-15T00:00:00+09:00", end: "2026-07-16T00:00:00+09:00" }
    });

    const segments = summaries["2026-07-15"].segments;
    expect(segments).toHaveLength(DAILY_BUSY_TIMELINE_SEGMENT_COUNT);
    expect(segments[0]).toBe(0); // 0〜4時: 誰も予定なし
    expect(segments[1]).toBe(0); // 4〜8時: 誰も予定なし
    expect(segments[2]).toBe(2); // 8〜12時: AとBが重なる
    expect(segments[3]).toBe(1); // 12〜16時: Bのみ
    expect(segments[4]).toBe(0); // 16〜20時
    expect(segments[5]).toBe(0); // 20〜24時
  });

  it("時間帯内訳の区分数は24時間を4時間ずつに割った数になる", () => {
    expect(DAILY_BUSY_TIMELINE_SEGMENT_COUNT).toBe(24 / DAILY_BUSY_TIMELINE_SEGMENT_HOURS);
  });
});
