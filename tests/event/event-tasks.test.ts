import { describe, expect, it } from "vitest";

import { sortEventTasks, summarizeEventTasks, type EventTask } from "@/lib/domain/event/event-tasks";

function task(overrides: Partial<EventTask> & { id: string }): EventTask {
  return {
    title: "持ち物",
    assigneeUserId: null,
    assigneeName: null,
    doneAt: null,
    sortOrder: 0,
    ...overrides
  };
}

describe("sortEventTasks", () => {
  it("未完了を先に、その中は登録順で並べる", () => {
    const sorted = sortEventTasks([
      task({ id: "c", sortOrder: 2 }),
      task({ id: "a", sortOrder: 0 }),
      task({ id: "b", sortOrder: 1 })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("完了したものは後ろに送る", () => {
    const sorted = sortEventTasks([
      task({ id: "done", sortOrder: 0, doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "todo", sortOrder: 1 })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["todo", "done"]);
  });

  it("元の配列を書き換えない", () => {
    const original = [task({ id: "b", sortOrder: 1 }), task({ id: "a", sortOrder: 0 })];
    sortEventTasks(original);

    expect(original.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("summarizeEventTasks", () => {
  it("完了件数と割合を返す", () => {
    const summary = summarizeEventTasks([
      task({ id: "a", doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "b" }),
      task({ id: "c", doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "d" })
    ]);

    expect(summary).toEqual({ total: 4, doneCount: 2, percent: 50 });
  });

  it("0件のときに割り算で壊れない", () => {
    expect(summarizeEventTasks([])).toEqual({ total: 0, doneCount: 0, percent: 0 });
  });

  it("割合は整数に丸める", () => {
    const summary = summarizeEventTasks([
      task({ id: "a", doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "b" }),
      task({ id: "c" })
    ]);

    expect(summary.percent).toBe(33);
  });
});
