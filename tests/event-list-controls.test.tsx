import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventListControls } from "@/components/event-list-controls";

describe("EventListControls", () => {
  it("renders lightweight GET controls and a visible draft count", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={1}
        pagination={{
          page: 1,
          pageSize: 10,
          totalItems: 4,
          totalPages: 1,
          from: 1,
          to: 4,
          rangeFrom: 0,
          rangeTo: 9
        }}
      />
    );

    const form = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("combobox", { name: "状態" })).toHaveValue("active");
    expect(screen.getByRole("option", { name: "下書き (1)" })).toBeInTheDocument();
    expect(screen.getByText("下書き 1件")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "カテゴリ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "表示順" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "表示件数" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50件" })).toBeInTheDocument();
  });

  it("renders pagination links while preserving the current filters", () => {
    render(
      <EventListControls
        query={{ status: "cancelled", category: "live", sort: "latest", pageSize: 20, page: 2 }}
        draftCount={0}
        pagination={{
          page: 2,
          pageSize: 20,
          totalItems: 46,
          totalPages: 3,
          from: 21,
          to: 40,
          rangeFrom: 20,
          rangeTo: 39
        }}
      />
    );

    expect(screen.getByText("21-40 / 46件")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前のページ" })).toHaveAttribute(
      "href",
      "/events?status=cancelled&category=live&sort=latest&limit=20"
    );
    expect(screen.getByRole("link", { name: "次のページ" })).toHaveAttribute(
      "href",
      "/events?status=cancelled&category=live&sort=latest&limit=20&page=3"
    );
  });
});
