import { describe, expect, it } from "vitest";

import { buildAdjustmentCalendar, defaultSelectedDateKey } from "@/lib/domain/adjustment-calendar";

/**
 * 本番(Vercel)は UTC、開発機は JST で動く。TZ を差し替えないと開発機では
 * 日付のずれが起きようがなく、ずれを守るはずのテストが全部素通りしてしまう。
 */
function withTz<T>(timeZone: string, run: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    process.env.TZ = original;
  }
}

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

  it("marks overlapping candidate time ranges even when start times differ", () => {
    const calendar = buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-12",
      candidates: [
        {
          ...baseCandidates[0],
          id: "range-1",
          startAt: "2026-07-12T13:00:00+09:00",
          endAt: "2026-07-12T15:00:00+09:00"
        },
        {
          ...baseCandidates[1],
          id: "range-2",
          startAt: "2026-07-12T14:30:00+09:00",
          endAt: "2026-07-12T16:00:00+09:00"
        }
      ]
    });

    expect(calendar.daysByKey.get("2026-07-12")?.hasOverlap).toBe(true);
  });

  it("shows multi-day candidates on every day they span", () => {
    const calendar = buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-13",
      candidates: [
        {
          ...baseCandidates[0],
          id: "multi-day",
          startAt: "2026-07-12T23:00:00+09:00",
          endAt: "2026-07-13T01:30:00+09:00"
        }
      ]
    });

    expect(calendar.daysByKey.get("2026-07-12")?.candidateCount).toBe(1);
    expect(calendar.daysByKey.get("2026-07-13")?.candidateCount).toBe(1);
    expect(calendar.selectedCandidates).toEqual([
      expect.objectContaining({
        id: "multi-day"
      })
    ]);
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

describe("defaultSelectedDateKey", () => {
  it("サーバーが UTC でも、JST の日付で「今日」を選ぶ", () => {
    // JST 2026-07-15 08:00 = UTC 2026-07-14 23:00。
    // ローカルゲッターで出すと 07-14 になり、カレンダーが「昨日」を選択して開く。
    const now = new Date("2026-07-15T08:00:00+09:00");

    expect(withTz("UTC", () => defaultSelectedDateKey(2026, 7, now))).toBe("2026-07-15");
    expect(withTz("Asia/Tokyo", () => defaultSelectedDateKey(2026, 7, now))).toBe("2026-07-15");
  });

  it("表示中の月に今日が含まれなければ月初を選ぶ", () => {
    const now = new Date("2026-07-15T08:00:00+09:00");

    expect(withTz("UTC", () => defaultSelectedDateKey(2026, 8, now))).toBe("2026-08-01");
  });

  it("月をまたぐ境目でも、JST の月で判断する", () => {
    // JST 2026-08-01 07:00 = UTC 2026-07-31 22:00。JST ではもう 8 月。
    const now = new Date("2026-08-01T07:00:00+09:00");

    // 8 月を表示中なら「今日(8/1)」が選ばれる。UTC 判定だと 7 月扱いになり月初(08-01)に
    // 落ちて偶然一致してしまうので、7 月を表示したときの結果と合わせて両側を固定する。
    expect(withTz("UTC", () => defaultSelectedDateKey(2026, 8, now))).toBe("2026-08-01");
    // 7 月を表示中なら今日は含まれないので月初。UTC 判定だと「今日は 7/31」で 07-31 になる。
    expect(withTz("UTC", () => defaultSelectedDateKey(2026, 7, now))).toBe("2026-07-01");
  });
});

describe("candidateDateKeys の TZ 非依存性", () => {
  function multiDayCalendar() {
    return buildAdjustmentCalendar({
      year: 2026,
      month: 7,
      selectedDateKey: "2026-07-13",
      candidates: [
        {
          ...baseCandidates[0],
          id: "multi-day",
          // JST 7/12 23:00 -> 7/13 01:30。終了は UTC だとまだ 7/12(16:30Z)。
          startAt: "2026-07-12T23:00:00+09:00",
          endAt: "2026-07-13T01:30:00+09:00"
        }
      ]
    });
  }

  it("サーバーが UTC でも、日をまたぐ候補が翌日のマスに出る", () => {
    // 上の "shows multi-day candidates on every day they span" は同じ内容だが、
    // 開発機(JST)ではローカルゲッターのままでも通ってしまい何も守らない。
    // TZ を UTC に差し替えて、本番と同じ条件で固定する。
    const utc = withTz("UTC", multiDayCalendar);
    expect(utc.daysByKey.get("2026-07-12")?.candidateCount).toBe(1);
    expect(utc.daysByKey.get("2026-07-13")?.candidateCount).toBe(1);
    expect(utc.selectedCandidates).toHaveLength(1);
  });

  it("JST でも結果が変わらない", () => {
    const jst = withTz("Asia/Tokyo", multiDayCalendar);
    expect(jst.daysByKey.get("2026-07-12")?.candidateCount).toBe(1);
    expect(jst.daysByKey.get("2026-07-13")?.candidateCount).toBe(1);
  });
});
