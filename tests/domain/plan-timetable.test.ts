import { describe, expect, it } from "vitest";

import {
  groupTimetableItemsByDate,
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
