import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventListControls } from "@/components/event-list-controls";

const basePagination = {
  page: 1,
  pageSize: 10 as const,
  totalItems: 4,
  totalPages: 1,
  from: 1,
  to: 4,
  rangeFrom: 0,
  rangeTo: 9
};

describe("EventListControls", () => {
  it("状態はチップで出し、押すと1ページ目に戻る", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 3 }}
        draftCount={2}
        pagination={{ ...basePagination, page: 3, totalItems: 46, totalPages: 5, from: 21, to: 30 }}
      />
    );

    const chips = screen.getByRole("navigation", { name: "状態で絞り込む" });
    expect(within(chips).getByRole("link", { name: "進行中" })).toHaveAttribute("aria-current", "page");
    // 3ページ目のまま状態だけ変えると、件数が足りず空振りする
    expect(within(chips).getByRole("link", { name: "完了" })).toHaveAttribute("href", "/events?status=completed");
    expect(within(chips).getByRole("link", { name: "中止" })).toHaveAttribute("href", "/events?status=cancelled");
  });

  it("下書きの件数はチップに出る", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={2}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き 2" })).toHaveAttribute("href", "/events?status=draft");
  });

  it("下書きが0件なら数字を出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き" })).toBeInTheDocument();
  });

  it("既定の条件なら詳しい絞り込みは畳んでおく", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "cancelled", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // 状態はチップ側なので、畳む判定には数えない
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("すべてのカテゴリ · 新しく作成した順 · 10件")).toBeInTheDocument();
  });

  it("既定以外の条件が入っていたら開いた状態で出す", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "live", sort: "soonest", pageSize: 20, page: 1 }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // 畳んだままだと、なぜこの並び順なのかが画面のどこにも書かれていないことになる
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("カテゴリ・表示順・表示件数はGETフォームのまま残す", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={1}
        pagination={basePagination}
      />
    );

    const form = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("combobox", { name: "カテゴリ" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "表示順" })).toHaveValue("newest");
    expect(screen.getByRole("combobox", { name: "表示件数" })).toHaveValue("10");
    expect(screen.getByRole("option", { name: "50件" })).toBeInTheDocument();
    // 状態のセレクトはチップに置き換えた
    expect(screen.queryByRole("combobox", { name: "状態" })).not.toBeInTheDocument();
  });

  it("条件を変えても、チップで選んだ状態は保たれる", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "completed", category: "all", sort: "newest", pageSize: 10, page: 1 }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // hidden で送らないと、表示順を変えた瞬間に「進行中」へ戻ってしまう
    const hidden = container.querySelector('input[type="hidden"][name="status"]');
    expect(hidden).toHaveValue("completed");
  });

  it("ページ送りは絞り込みを保ったまま出す", () => {
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
