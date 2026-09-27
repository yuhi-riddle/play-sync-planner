import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionGroupEvents } from "@/components/account/connection-group-events";
import type { ConnectionGroupEvent } from "@/lib/domain/account/connection-groups";

const active: ConnectionGroupEvent = {
  eventId: "e1",
  title: "謎解き 秋公演",
  displayState: "answer_waiting",
  isActive: true,
  memberCount: 2,
  groupMemberCount: 3
};
const done = (index: number): ConnectionGroupEvent => ({
  eventId: `d${index}`,
  title: `おわった会${index}`,
  displayState: "completed",
  isActive: false,
  memberCount: 1,
  groupMemberCount: 3
});

describe("ConnectionGroupEvents", () => {
  it("進行中のイベントを、状態と重なりの人数つきのリンクで並べる", () => {
    render(<ConnectionGroupEvents events={[active]} />);
    expect(screen.getByRole("heading", { name: "進めているイベント" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /謎解き 秋公演/ });
    expect(link).toHaveAttribute("href", "/events/e1");
    expect(link).toHaveTextContent("回答待ち");
    expect(link).toHaveTextContent("3人中2人");
  });

  it("おわったイベントは件数つきの折りたたみに入れ、はじめは閉じておく", () => {
    const { container } = render(<ConnectionGroupEvents events={[active, done(1), done(2)]} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const summary = within(details as HTMLElement).getByText("最近おわったイベント 2件");
    fireEvent.click(summary);
    expect(within(details as HTMLElement).getByRole("link", { name: /おわった会1/ })).toHaveTextContent("完了");
  });

  it("進行中がないときは説明を出し、おわったものがなければ折りたたみを出さない", () => {
    const { container } = render(<ConnectionGroupEvents events={[]} />);
    expect(screen.getByText("このグループの人と進めているイベントはありません。")).toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });
});
