import { describe, expect, it } from "vitest";

import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  resolveCurrentTimetableItemIds,
  resolveTimetableDurations,
  sortTimetableItems,
  toJstDateKey,
  type TimetableItem
} from "@/lib/domain/plan-timetable";

/** テストごとに必要な項目だけ上書きする。 */
function item(overrides: Partial<TimetableItem> & Pick<TimetableItem, "id" | "startAt">): TimetableItem {
  return {
    endAt: null,
    title: `項目 ${overrides.id}`,
    note: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    assignees: [],
    ...overrides
  };
}

describe("toJstDateKey", () => {
  it("JSTの日付を返す", () => {
    expect(toJstDateKey("2026-08-15T10:00:00+09:00")).toBe("2026-08-15");
  });

  it("UTCで前日になる時刻でもJSTの日付になる", () => {
    // 2026-08-15T22:00+09:00 は UTC では 08-15T13:00。翌日をまたぐ 00:30+09:00 で確認する。
    expect(toJstDateKey("2026-08-16T00:30:00+09:00")).toBe("2026-08-16");
  });
});

describe("sortTimetableItems", () => {
  it("開始時刻の昇順で並べる", () => {
    const sorted = sortTimetableItems([
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("同時刻は作成順で決着する", () => {
    const sorted = sortTimetableItems([
      item({ id: "late", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-02T00:00:00+09:00" }),
      item({ id: "early", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:00:00+09:00" })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("元の配列を書き換えない", () => {
    const items = [
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" })
    ];

    sortTimetableItems(items);

    expect(items.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("groupTimetableItemsByDate", () => {
  it("単日なら1グループにまとめる", () => {
    const groups = groupTimetableItemsByDate([
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe("2026-08-15");
    expect(groups[0].items.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("複数日は日付ごとに分ける", () => {
    const groups = groupTimetableItemsByDate([
      item({ id: "day2", startAt: "2026-08-16T09:00:00+09:00" }),
      item({ id: "day1", startAt: "2026-08-15T09:00:00+09:00" })
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual(["2026-08-15", "2026-08-16"]);
  });

  it("日をまたぐ項目は開始日のグループに入れる", () => {
    const groups = groupTimetableItemsByDate([
      item({
        id: "night",
        startAt: "2026-08-15T22:00:00+09:00",
        endAt: "2026-08-16T02:00:00+09:00"
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe("2026-08-15");
  });

  it("空なら空配列を返す", () => {
    expect(groupTimetableItemsByDate([])).toEqual([]);
  });
});

function assignee(id: string, name: string) {
  return { participantId: id, displayName: name, status: "confirmed" };
}

describe("buildTimetableBlocks", () => {
  it("重ならない行はそれぞれ単独のブロックになる", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00", endAt: "2026-08-15T10:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T10:00:00+09:00", endAt: "2026-08-15T11:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.kind === "single")).toBe(true);
  });

  it("終了時刻が無い同時刻の2行を分岐と判定しない", () => {
    const blocks = buildTimetableBlocks([
      // 長い枠の中に置くことで、null 行が分岐に参加しないことを本当に検証する。
      item({ id: "trip", startAt: "2026-08-15T12:00:00+09:00", endAt: "2026-08-15T18:00:00+09:00" }),
      item({ id: "gather", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "reception", startAt: "2026-08-15T13:00:00+09:00" })
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["single", "single", "single"]);
  });

  it("終了時刻を持つ行同士が重なると分岐ブロックになる", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "sea",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T16:00:00+09:00",
        assignees: [assignee("p2", "ゆうき")]
      })
    ]);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.startAt).toBe("2026-08-15T13:00:00+09:00");
    // 合流は end_at の最大値。
    expect(new Date(block.endAt).toISOString()).toBe(new Date("2026-08-15T16:00:00+09:00").toISOString());
    expect(block.lanes).toHaveLength(2);
  });

  it("重なりを推移的につなげる", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:30:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "c", startAt: "2026-08-15T14:30:00+09:00", endAt: "2026-08-15T16:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes.flatMap((lane) => lane.items.map((entry) => entry.id)).sort()).toEqual(["a", "b", "c"]);
  });

  it("同じ担当の行は同じレーンに時刻順で積む", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "sea1",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T14:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "sea2",
        startAt: "2026-08-15T14:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p2", "ゆうき")]
      })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
    const seaLane = block.lanes.find((lane) => lane.assignees[0]?.participantId === "p1");
    expect(seaLane?.items.map((entry) => entry.id)).toEqual(["sea1", "sea2"]);
  });

  it("担当の並び順が違っても同じレーンにまとめる", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "x",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T14:00:00+09:00",
        assignees: [assignee("p1", "あかり"), assignee("p2", "ゆうき")]
      }),
      item({
        id: "y",
        startAt: "2026-08-15T13:30:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p2", "ゆうき"), assignee("p1", "あかり")]
      }),
      item({
        id: "z",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p3", "そら")]
      })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
  });

  it("担当が空の行は重なっても行ごとに別レーンにする", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:30:00+09:00", endAt: "2026-08-15T14:00:00+09:00" })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
  });

  it("終了時刻の無い行が間に挟まっても分岐は壊れない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "sea", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "memo", startAt: "2026-08-15T13:30:00+09:00" }),
      item({ id: "cafe", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T16:00:00+09:00" })
    ]);

    const branchBlocks = blocks.filter((block) => block.kind === "branch");
    expect(branchBlocks).toHaveLength(1);
    expect(blocks.filter((block) => block.kind === "single")).toHaveLength(1);
  });

  it("終わりと始まりが接するだけなら重なりとみなさない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" })
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["single", "single"]);
  });

  it("短い行を内包しても、後続の重なりを取りこぼさない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "long", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T16:00:00+09:00" }),
      item({ id: "short", startAt: "2026-08-15T13:30:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "late", startAt: "2026-08-15T15:00:00+09:00", endAt: "2026-08-15T15:30:00+09:00" })
    ]);

    expect(blocks).toHaveLength(1);
  });
});

describe("resolveTimetableDurations", () => {
  it("終了時刻があればその差を分で返す", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:30:00+09:00" })
    ]);

    expect(durations.a).toBe(90);
  });

  it("終了時刻が無ければ次に始まる行との差にする", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:45:00+09:00" })
    ]);

    expect(durations.a).toBe(45);
  });

  it("同時刻の行は飛ばして次に始まる行を探す", () => {
    const durations = resolveTimetableDurations([
      item({ id: "gather", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:00:00+09:00" }),
      item({ id: "reception", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:01:00+09:00" }),
      item({ id: "start", startAt: "2026-08-15T13:30:00+09:00" })
    ]);

    expect(durations.gather).toBe(30);
    expect(durations.reception).toBe(30);
  });

  it("最後の行に終了時刻が無ければ所要時間を出さない", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "last", startAt: "2026-08-15T17:00:00+09:00" })
    ]);

    expect(durations.last).toBeUndefined();
  });

  it("不均等に二手へ分かれても、次の行との差で上書きしない", () => {
    // 海チーム 13:00-15:00 / カフェ組 13:00-16:00。
    // 「次に始まる行との差」で計算すると海チームが 0 分になってしまう。
    const durations = resolveTimetableDurations([
      item({
        id: "sea",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        createdAt: "2026-08-01T00:00:00+09:00"
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T16:00:00+09:00",
        createdAt: "2026-08-01T00:01:00+09:00"
      })
    ]);

    expect(durations.sea).toBe(120);
    expect(durations.cafe).toBe(180);
  });
});

describe("resolveCurrentTimetableItemIds", () => {
  const schedule = [
    item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
    item({ id: "b", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" })
  ];

  it("開始前は空集合を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T12:00:00+09:00"));

    expect(current.size).toBe(0);
  });

  it("進行中の行を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T13:30:00+09:00"));

    expect([...current]).toEqual(["a"]);
  });

  it("すべて終わったら空集合を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T16:00:00+09:00"));

    expect(current.size).toBe(0);
  });

  it("分岐中は複数の行が同時に返る", () => {
    const current = resolveCurrentTimetableItemIds(
      [
        item({
          id: "sea",
          startAt: "2026-08-15T13:00:00+09:00",
          endAt: "2026-08-15T15:00:00+09:00",
          createdAt: "2026-08-01T00:00:00+09:00"
        }),
        item({
          id: "cafe",
          startAt: "2026-08-15T13:00:00+09:00",
          endAt: "2026-08-15T16:00:00+09:00",
          createdAt: "2026-08-01T00:01:00+09:00"
        })
      ],
      new Date("2026-08-15T14:00:00+09:00")
    );

    expect([...current].sort()).toEqual(["cafe", "sea"]);
  });

  it("終了時刻が無い行は次に始まる行までを進行中とみなす", () => {
    const items = [
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" })
    ];

    expect([...resolveCurrentTimetableItemIds(items, new Date("2026-08-15T13:30:00+09:00"))]).toEqual(["a"]);
    expect([...resolveCurrentTimetableItemIds(items, new Date("2026-08-15T14:30:00+09:00"))]).toEqual(["b"]);
  });

  it("終了時刻の無い最後の行は始まったあとも進行中のままにする", () => {
    const current = resolveCurrentTimetableItemIds(
      [item({ id: "last", startAt: "2026-08-15T17:00:00+09:00" })],
      new Date("2026-08-15T23:00:00+09:00")
    );

    expect([...current]).toEqual(["last"]);
  });
});
