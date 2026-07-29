import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventTaskList } from "@/components/event-task-list";
import type { EventTask } from "@/lib/domain/event-tasks";

const members = [
  { userId: "user-1", displayName: "あかり" },
  { userId: "user-2", displayName: "ゆうき" }
];

const actions = {
  createAction: vi.fn(),
  toggleAction: vi.fn(),
  assignAction: vi.fn(),
  deleteAction: vi.fn()
};

function task(overrides: Partial<EventTask> & { id: string }): EventTask {
  return {
    title: "浮き輪",
    assigneeUserId: null,
    assigneeName: null,
    doneAt: null,
    sortOrder: 0,
    ...overrides
  };
}

function renderList(tasks: EventTask[], canEdit = true) {
  return render(<EventTaskList tasks={tasks} members={members} canEdit={canEdit} {...actions} />);
}

describe("EventTaskList", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("セクションに読み上げ可能な名前が付いている", () => {
    renderList([task({ id: "a" })]);

    expect(screen.getByRole("region", { name: "持ち物・役割の分担" })).toBeInTheDocument();
  });

  it("何も無いときは空状態を出す", () => {
    renderList([]);

    expect(screen.getByText(/まだ分担はありません/)).toBeInTheDocument();
  });

  it("未完了を先に並べる", () => {
    renderList([
      task({ id: "done", title: "氷", sortOrder: 0, doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "todo", title: "浮き輪", sortOrder: 1 })
    ]);

    const titles = screen.getAllByTestId("event-task-title").map((element) => element.textContent);
    expect(titles).toEqual(["浮き輪", "氷"]);
  });

  it("完了件数を進捗として示す", () => {
    renderList([
      task({ id: "a", doneAt: "2026-07-27T00:00:00.000Z" }),
      task({ id: "b" })
    ]);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("担当者なしのときは「担当なし」と分かるようにする", () => {
    renderList([task({ id: "a" })]);

    const row = screen.getByTestId("event-task-a");
    expect(within(row).getByRole("combobox")).toHaveValue("");
    expect(within(row).getByRole("option", { name: "担当なし" })).toBeInTheDocument();
  });

  it("参加していない人には編集用の操作を出さない", () => {
    renderList([task({ id: "a" })], false);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "追加" })).not.toBeInTheDocument();
    expect(screen.getByTestId("event-task-title")).toBeInTheDocument();
  });
});
