import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  sortTimetableItems,
  toJstDateKey,
  type TimetableItem
} from "@/lib/domain/plan/plan-timetable";

function item(override: Partial<TimetableItem> & { id: string; startAt: string }): TimetableItem {
  return {
    endAt: null,
    title: "placeholder",
    note: null,
    createdAt: "2026-08-15T00:00:00+09:00",
    assignees: [],
    ...override
  };
}

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
      item({ id: "gather", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "reception", startAt: "2026-08-15T13:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.kind)).toEqual(["single", "single"]);
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
});
