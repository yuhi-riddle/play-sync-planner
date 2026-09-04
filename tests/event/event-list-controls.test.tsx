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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 3, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={2}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き 2" })).toHaveAttribute("href", "/events?status=draft");
  });

  it("下書きが0件なら数字を出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き" })).toBeInTheDocument();
  });

  it("既定の条件なら詳しい絞り込みは畳んでおく", () => {
    const { container } = render(
      <EventListControls
        query={{ status: "cancelled", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "live", sort: "soonest", pageSize: 20, page: 1, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
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
        query={{ status: "completed", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // hidden で送らないと、表示順を変えた瞬間に「進行中」へ戻ってしまう
    const hidden = container.querySelector('input[type="hidden"][name="status"]');
    expect(hidden).toHaveValue("completed");
  });

  it("条件フォームは進行状態も hidden で持ち回す", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "answer_waiting"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    // 検索・カテゴリ・表示順を変えたときに進行状態フィルタが外れないように
    const form = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    expect(form.querySelector('input[type="hidden"][name="display"]')).toHaveValue("answer_waiting");
  });

  it("絞り込みは見出し付きのカードで囲う", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
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

  it("検索欄は件数によらず常に出す（条件フォームの一部）", () => {
    // 以前は総件数 > 表示件数のときだけ出していて、表示件数を増やすと消える挙動が分かりにくかった
    const { container } = render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const searchBox = container.querySelector('input[name="search"][type="search"]');
    expect(searchBox).not.toBeNull();
    expect(searchBox?.closest('form[aria-label="イベント一覧の表示条件"]')).not.toBeNull();
  });

  it("検索と条件は1つのフォームで送る。状態は hidden、page は送らない", () => {
    render(
      <EventListControls
        query={{ status: "completed", category: "live", sort: "soonest", pageSize: 20, page: 2, search: "", displayState: "all" }}
        draftCount={0}
        pagination={{ ...manyPagination, pageSize: 20 }}
      />
    );

    const form = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    // 状態はチップ側なので hidden で持ち回す
    expect(form.querySelector('input[type="hidden"][name="status"]')).toHaveValue("completed");
    // カテゴリ・表示順・表示件数は select 本体が name を持つので、そのまま送られる
    expect(form.querySelector('select[name="category"]')).toHaveValue("live");
    expect(form.querySelector('select[name="sort"]')).toHaveValue("soonest");
    expect(form.querySelector('select[name="limit"]')).toHaveValue("20");
    expect(form.querySelector('input[name="search"]')).not.toBeNull();
    // page は送らない。2ページ目のまま検索すると空振りする
    expect(form.querySelector('[name="page"]')).toBeNull();
  });

  it("検索中は、検索語と解除の導線を出す", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "live", sort: "newest", pageSize: 10, page: 1, search: "沖縄", displayState: "all" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.queryByRole("link", { name: "検索を解除" })).not.toBeInTheDocument();
  });

  it("条件を変えても検索語は残る", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "沖縄", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const detailForm = screen.getByRole("form", { name: "イベント一覧の表示条件" });
    // 検索欄は条件フォームの中。今の語を初期値に残す（消えると打ち直しになる）
    expect(detailForm.querySelector('input[name="search"][type="search"]')).toHaveValue("沖縄");
  });

  it("状態のチップは検索語を保ったまま切り替える", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "沖縄", displayState: "all" }}
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
        query={{ status: "cancelled", category: "live", sort: "latest", pageSize: 20, page: 2, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
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
        query={{ status: "active", category: "nazotoki", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const select = screen.getByRole("combobox", { name: "カテゴリ" });
    expect(select).toHaveClass("border-category-nazotoki", "bg-category-nazotoki/16");
    const dot = select.closest("label")?.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-category-nazotoki");
  });

  it("status=active のとき進行状態の2段目チップが出る", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "all"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const nav = screen.getByRole("navigation", { name: "進行状態で絞り込む" });
    expect(within(nav).getByRole("link", { name: "回答待ち" })).toHaveAttribute(
      "href",
      "/events?display=answer_waiting"
    );
    expect(within(nav).getByRole("link", { name: "すべて" })).toHaveAttribute("href", "/events");
  });

  it("status=completed のとき2段目チップは出ない", () => {
    render(
      <EventListControls
        query={{
          status: "completed",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "all"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.queryByRole("navigation", { name: "進行状態で絞り込む" })).not.toBeInTheDocument();
  });

  it("選択中の進行状態チップに aria-current が付く", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "event_waiting"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const nav = screen.getByRole("navigation", { name: "進行状態で絞り込む" });
    expect(within(nav).getByRole("link", { name: "開催待ち" })).toHaveAttribute("aria-current", "page");
  });

  it("上段の状態チップを押すと進行状態は all に戻る", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "answer_waiting"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const statusNav = screen.getByRole("navigation", { name: "状態で絞り込む" });
    expect(within(statusNav).getByRole("link", { name: "完了" })).toHaveAttribute(
      "href",
      "/events?status=completed"
    );
  });
});
