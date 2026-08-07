import { readFileSync } from "node:fs";
import path from "node:path";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventDetailTabs } from "@/components/event/event-detail-tabs";

describe("EventDetailTabs", () => {
  it("4つのタブを出す", () => {
    render(<EventDetailTabs eventId="event-1" active="overview" />);

    expect(screen.getByRole("link", { name: "概要" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "参加者" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "チャット" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "タスク" })).toBeInTheDocument();
  });

  it("概要タブのリンクにはクエリを付けない", () => {
    render(<EventDetailTabs eventId="event-1" active="chat" />);

    expect(screen.getByRole("link", { name: "概要" })).toHaveAttribute("href", "/events/event-1");
  });

  it("概要以外のタブはクエリ付きのリンクになる", () => {
    render(<EventDetailTabs eventId="event-1" active="overview" />);

    expect(screen.getByRole("link", { name: "チャット" })).toHaveAttribute("href", "/events/event-1?tab=chat");
    expect(screen.getByRole("link", { name: "タスク" })).toHaveAttribute("href", "/events/event-1?tab=tasks");
    expect(screen.getByRole("link", { name: "参加者" })).toHaveAttribute("href", "/events/event-1?tab=members");
  });

  it("開いているタブが分かるようにする", () => {
    render(<EventDetailTabs eventId="event-1" active="chat" />);

    expect(screen.getByRole("link", { name: "チャット" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "概要" })).not.toHaveAttribute("aria-current");
  });

  // middleware が全リクエストで Supabase に2往復するため、4タブ分を先読みすると
  // タブ化で減らした往復を食い潰す。prefetch は明示的に切る。
  it("タブのリンクは先読みしない", () => {
    const source = readFileSync(path.join(process.cwd(), "components/event/event-detail-tabs.tsx"), "utf8");

    expect(source).toContain("prefetch={false}");
  });
});
