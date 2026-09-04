import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventListControls } from "@/components/event/event-list-controls";

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

/** 1ページに収まらない件数。検索欄はこのときだけ出る。 */
const manyPagination = { ...basePagination, totalItems: 27, totalPages: 3, to: 10 };

describe("EventListControls", () => {
  it("状態はチップで出し、押すと1ページ目に戻る", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 3, search: "" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={2}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き 2" })).toHaveAttribute("href", "/events?status=draft");
  });

  it("下書きが0件なら数字を出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き" })).toBeInTheDocument();
  });

  it("既定の条件なら詳しい絞り込みは畳んでおく", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "cancelled", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
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
        query={{ status: "active", category: "live", sort: "soonest", pageSize: 20, page: 1, search: "" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
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
        query={{ status: "completed", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // hidden で送らないと、表示順を変えた瞬間に「進行中」へ戻ってしまう
    const hidden = container.querySelector('input[type="hidden"][name="status"]');
    expect(hidden).toHaveValue("completed");
  });

  it("絞り込みは見出し付きのカードで囲う", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // 下のイベント一覧との境界をはっきりさせる
    expect(screen.getByText("絞り込み")).toBeInTheDocument();
  });

  it("検索欄は『検索・並び替え』の折りたたみに入れる", () => {
    // 境界はカードで示すので、検索は畳んでよい。状態チップは表に残す
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={manyPagination}
      />
    );
    expect(screen.getByText("検索・並び替え")).toBeInTheDocument();
    const searchBox = container.querySelector('input[name="search"][type="search"]');
    expect(searchBox).not.toBeNull();
    expect(searchBox?.closest("details")).not.toBeNull();
    // 状態チップは折りたたみの外
    expect(screen.getByRole("navigation", { name: "状態で絞り込む" }).closest("details")).toBeNull();
  });

  it("1ページに収まる件数なら検索欄は出さない", () => {
    // 375px で 56px 使うのに、全部見えている人には効かない
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(container.querySelector('input[name="search"][type="search"]')).toBeNull();
  });

  it("検索中は、結果が1件でも検索欄を出し続ける", () => {
    // 消すと検索語を直せなくなる
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "沖縄" }}
        draftCount={0}
        pagination={{ ...basePagination, totalItems: 1, totalPages: 1, from: 1, to: 1 }}
      />
    );

    expect(container.querySelector('input[name="search"][type="search"]')).not.toBeNull();
  });

  it("検索しても絞り込みは持ち回す", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "completed", category: "live", sort: "soonest", pageSize: 20, page: 2, search: "" }}
        draftCount={0}
        pagination={{ ...manyPagination, pageSize: 20 }}
      />
    );

    // 持ち回さないと、検索した瞬間に「進行中・すべて・新しい順」へ戻る
    const form = container.querySelector('form[role="search"]');
    const hidden = Object.fromEntries(
      [...(form?.querySelectorAll('input[type="hidden"]') ?? [])].map((input) => [
        input.getAttribute("name"),
        input.getAttribute("value")
      ])
    );
    expect(hidden).toEqual({ status: "completed", category: "live", sort: "soonest", limit: "20" });
    // page は送らない。2ページ目のまま検索すると空振りする
    expect(form?.querySelector('input[name="page"]')).toBeNull();
  });

  it("検索中は、検索語と解除の導線を出す", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "live", sort: "newest", pageSize: 10, page: 1, search: "沖縄" }}
        draftCount={0}
        pagination={{ ...basePagination, totalItems: 0, totalPages: 0, from: 0, to: 0 }}
      />
    );

    // 0件だと件数の行が出ないので、ここに解除が無いと戻れなくなる
    expect(screen.getByText("「沖縄」で検索中")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "検索を解除" })).toHaveAttribute("href", "/events?category=live");
  });

  it("検索していなければ解除の導線は出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.queryByRole("link", { name: "検索を解除" })).not.toBeInTheDocument();
  });

  it("条件を変えても検索語は残る", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "沖縄" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const detailForm = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    expect(detailForm.querySelector('input[type="hidden"][name="search"]')).toHaveValue("沖縄");
    // 検索欄側にも今の語を残す。消えると打ち直しになる
    expect(container.querySelector('input[name="search"][type="search"]')).toHaveValue("沖縄");
  });

  it("状態のチップは検索語を保ったまま切り替える", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "沖縄" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const chips = screen.getByRole("navigation", { name: "状態で絞り込む" });
    expect(within(chips).getByRole("link", { name: "完了" })).toHaveAttribute(
      "href",
      "/events?status=completed&search=%E6%B2%96%E7%B8%84"
    );
  });

  it("ページ送りは絞り込みを保ったまま出す", () => {
    render(
      <EventListControls
        query={{ status: "cancelled", category: "live", sort: "latest", pageSize: 20, page: 2, search: "" }}
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

  it("カテゴリがすべてなら色ドットも枠色も出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const select = screen.getByRole("combobox", { name: "カテゴリ" });
    expect(select).toHaveClass("border-line-strong", "bg-surface");
    expect(select.closest("label")?.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("カテゴリを選んでいれば選択中カテゴリの色をラベルとselectに出す", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "nazotoki", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const select = screen.getByRole("combobox", { name: "カテゴリ" });
    expect(select).toHaveClass("border-category-nazotoki", "bg-category-nazotoki/16");
    const dot = select.closest("label")?.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-category-nazotoki");
  });
});
