import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeNextConfirmedEventCard } from "@/components/home/home-next-confirmed-event-card";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const baseItem: HomeCalendarItem = {
  id: "confirmed-1",
  kind: "confirmed",
  title: "夏祭り",
  location: "代々木公園",
  startAt: "2026-07-26T18:00:00+09:00",
  endAt: "2026-07-26T20:00:00+09:00",
  href: "/plans/plan-1"
};

describe("HomeNextConfirmedEventCard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("shows the title, confirmed badge, date range, and a link to the detail page", () => {
    render(<HomeNextConfirmedEventCard item={baseItem} />);

    expect(screen.getByText("夏祭り")).toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText("代々木公園")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/plans/plan-1");
  });

  it("does not render a location row when the item has no location", () => {
    render(<HomeNextConfirmedEventCard item={{ ...baseItem, location: null }} />);

    expect(screen.queryByText("代々木公園")).not.toBeInTheDocument();
  });

  it("renders without a link when the item has no href", () => {
    render(<HomeNextConfirmedEventCard item={{ ...baseItem, href: undefined }} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("夏祭り")).toBeInTheDocument();
  });
});
