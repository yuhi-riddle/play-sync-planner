import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventCategoryFilter } from "@/components/event/event-category-filter";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

describe("EventCategoryFilter", () => {
  it("uses a native mobile select and hides empty categories", () => {
    render(
      <EventCategoryFilter
        activeCategory="all"
        categoryCounts={{
          all: 2,
          live: 2,
          travel: 0,
          drinking: 0,
          nazotoki: 0,
          snowboard: 0,
          boardgame: 0,
          movie_stage: 0,
          other: 0
        }}
      />
    );

    expect(screen.getByRole("combobox", { name: "カテゴリで絞り込む" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "すべて" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ライブ" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "謎解き" })).not.toBeInTheDocument();
  });
});
