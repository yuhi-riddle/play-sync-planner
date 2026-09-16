import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActiveSharedEventsModal } from "@/components/account/active-shared-events-modal";
import type { ActiveSharedEvent } from "@/lib/domain/account/connections";

const events: ActiveSharedEvent[] = [
  { eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" },
  { eventId: "event-2", title: "謎解き公演", displayState: "answer_waiting" }
];

describe("ActiveSharedEventsModal", () => {
  it("イベント名と状態ラベルの行を、イベント詳細へのリンクとして出す", () => {
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={vi.fn()} />);

    const link = screen.getByRole("link", { name: /夏の集まり/ });
    expect(link).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByText("開催待ち")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /謎解き公演/ })).toHaveAttribute("href", "/events/event-2");
    expect(screen.getByText("回答待ち")).toBeInTheDocument();
  });

  it("0件なら空メッセージを出す", () => {
    render(<ActiveSharedEventsModal displayName="あきらさん" events={[]} onClose={vi.fn()} />);

    expect(screen.getByText("進行中の共通イベントはありません。")).toBeInTheDocument();
  });

  it("閉じるボタンでonCloseを呼ぶ", () => {
    const onClose = vi.fn();
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("Escapeキーで閉じる", () => {
    const onClose = vi.fn();
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
