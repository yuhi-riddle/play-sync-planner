import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeNextUpcomingEventCard } from "@/components/home/home-next-upcoming-event-card";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const confirmedItem: HomeCalendarItem = {
  id: "confirmed-1",
  kind: "confirmed",
  title: "夏祭り",
  location: "代々木公園",
  startAt: "2026-07-26T18:00:00+09:00",
  endAt: "2026-07-26T20:00:00+09:00",
  href: "/plans/plan-1"
};

const collectingItem: HomeCalendarItem = {
  id: "candidate-1",
  kind: "collecting",
  title: "謎解き公演フォローアップ",
  location: "渋谷",
  startAt: "2026-09-14T19:00:00+09:00",
  endAt: "2026-09-14T21:00:00+09:00",
  href: "/plans/plan-2"
};

describe("HomeNextUpcomingEventCard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("確定は『確定済み』バッジと『詳細を見る』リンクを出す", () => {
    render(<HomeNextUpcomingEventCard item={confirmedItem} />);

    expect(screen.getByText("次の予定")).toBeInTheDocument();
    expect(screen.getByText("夏祭り")).toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText("代々木公園")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "詳細を見る" })).toHaveAttribute("href", "/plans/plan-1");
  });

  it("調整中は『調整中』バッジと『日程を確認する』リンクを出す", () => {
    render(<HomeNextUpcomingEventCard item={collectingItem} />);

    expect(screen.getByText("次の予定")).toBeInTheDocument();
    expect(screen.getByText("謎解き公演フォローアップ")).toBeInTheDocument();
    expect(screen.getByText("調整中")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "日程を確認する" })).toHaveAttribute("href", "/plans/plan-2");
  });

  it("location が無ければ場所の行を出さない", () => {
    render(<HomeNextUpcomingEventCard item={{ ...confirmedItem, location: null }} />);

    expect(screen.queryByText("代々木公園")).not.toBeInTheDocument();
  });

  it("href が無ければリンクを出さない", () => {
    render(<HomeNextUpcomingEventCard item={{ ...confirmedItem, href: undefined }} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("夏祭り")).toBeInTheDocument();
  });
});
