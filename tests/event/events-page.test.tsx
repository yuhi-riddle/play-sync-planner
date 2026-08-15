import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect
}));
vi.mock("@/lib/actions/event/events", () => ({ cancelEventAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  getCurrentUserId,
  hasSupabaseEnv: () => true
}));

import EventsPage from "@/app/events/page";

function createEventQuery(data: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data, error: null })
  };
}

function createRpcResult(eventIds: string[], totalCount: number) {
  return vi.fn().mockResolvedValue({
    data: [{ event_ids: eventIds, total_count: totalCount }],
    error: null
  });
}

function makeEvent(id: string, title: string) {
  return {
    id,
    title,
    category: "other",
    start_date: null,
    end_date: null,
    location_name: null,
    status: "planning",
    created_at: "2026-07-15T00:00:00Z",
    plans: [],
    event_members: []
  };
}

function createDraftQuery(draft: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: draft, error: null })
  };
}

describe("EventsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("shows active events by default and exposes the saved draft count", async () => {
    const eventQuery = createEventQuery([makeEvent("event-1", "夏ライブ")]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    // 下書きの件数は独立したバッジをやめ、状態チップに寄せた
    expect(screen.getByRole("link", { name: "下書き 1" })).toHaveAttribute("href", "/events?status=draft");
    expect(screen.getByRole("heading", { name: "夏ライブ" })).toBeInTheDocument();
  });

  it("shows one concrete state and keeps the event card concise", async () => {
    const eventQuery = createEventQuery([{
      ...makeEvent("event-1", "週末の謎解き会"),
      category: "nazotoki",
      status: "interested",
      location_name: "新宿",
      event_members: [{ status: "joined" }],
      plans: [{ status: "draft", settlement_status: "settling" }]
    }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("参加者待ち")).toBeInTheDocument();
    expect(screen.getByText("新宿")).toBeInTheDocument();
    expect(screen.getByText("参加 1人")).toBeInTheDocument();
    const eventCardLink = screen.getByRole("link", { name: /週末の謎解き会/ });
    expect(within(eventCardLink).queryByText("謎解き")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText("清算中")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText("参加者を確認")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText("気になる")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText(/日程調整 \d+件/)).not.toBeInTheDocument();
  });

  it("colors settlement_waiting, completed, and cancelled with visibly different tones", async () => {
    const pastPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "needed",
      confirmed_start_at: "2020-01-01T00:00:00Z",
      confirmed_end_at: "2020-01-01T00:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([
      { ...makeEvent("event-1", "清算待ちイベント"), plans: [pastPlan] },
      { ...makeEvent("event-2", "完了イベント"), status: "done" },
      { ...makeEvent("event-3", "中止イベント"), status: "cancelled" }
    ]);
    const rpc = createRpcResult(["event-1", "event-2", "event-3"], 3);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    // ナビの絞り込みリンクにも「完了」「中止」の文言があるため、各イベントカード内に絞って取得する
    const settlementCard = screen.getByRole("link", { name: /清算待ちイベント/ });
    const completedCard = screen.getByRole("link", { name: /完了イベント/ });
    const cancelledCard = screen.getByRole("link", { name: /中止イベント/ });
    const settlementBadge = within(settlementCard).getByText("清算待ち");
    const completedBadge = within(completedCard).getByText("完了");
    const cancelledBadge = within(cancelledCard).getByText("中止");

    // settlement_waiting は neutral (border-line / bg-sunken / text-muted)
    expect(settlementBadge).toHaveClass("bg-sunken", "text-muted");
    // completed は done (bg-mist / text-pine、現状維持)
    expect(completedBadge).toHaveClass("bg-mist", "text-pine");
    // cancelled は warn (bg-clay/14 相当 / text-clay-ink) で、他の2つと明確に異なる
    expect(cancelledBadge).toHaveClass("text-clay-ink");
    expect(cancelledBadge.className).not.toBe(settlementBadge.className);
    expect(cancelledBadge.className).not.toBe(completedBadge.className);
  });

  it("omits the schedule and location rows when they are unset", async () => {
    const eventQuery = createEventQuery([{
      ...makeEvent("event-2", "まだ何も決まっていない会"),
      category: "other",
      status: "interested",
      location_name: null,
      event_members: [{ status: "joined" }],
      plans: []
    }]);
    const rpc = createRpcResult(["event-2"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("日程未設定")).not.toBeInTheDocument();
    expect(screen.queryByText("場所未設定")).not.toBeInTheDocument();
    expect(screen.getByText("参加 1人")).toBeInTheDocument();
  });

  it("asks the database for one page and fetches only the returned event ids", async () => {
    const eventQuery = createEventQuery([
      makeEvent("event-2", "2番目"),
      makeEvent("event-1", "1番目")
    ]);
    const rpc = createRpcResult(["event-1", "event-2"], 1001);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({
      searchParams: Promise.resolve({
        status: "completed",
        category: "travel",
        sort: "soonest",
        limit: "20",
        page: "2"
      })
    }));

    expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", {
      p_filter: "completed",
      p_category: "travel",
      p_sort: "soonest",
      p_limit: 20,
      p_offset: 20,
      p_query: null
    });
    expect(eventQuery.in).toHaveBeenCalledWith("id", ["event-1", "event-2"]);
    expect(screen.getAllByRole("heading", { level: 2, name: /番目/ }).map((heading) => heading.textContent)).toEqual([
      "1番目",
      "2番目"
    ]);
    expect(screen.getByText("21-40 / 1001件")).toBeInTheDocument();
  });

  it("検索語はデータベースに渡す", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 0);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ search: " 沖縄 " }) }));

    // アプリ側で絞ると、件数とページ送りが検索結果と噛み合わなくなる
    expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", expect.objectContaining({ p_query: "沖縄" }));
    expect(
      screen.getByText("「沖縄」に一致するイベントはありません。別の言葉で探すか、絞り込みを変えてみてください。")
    ).toBeInTheDocument();
  });

  it("下書きも検索でしぼる", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = vi.fn();
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel", location_name: "札幌" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    // 下書きはサーバーに無くcookieの中なので、SQL の ilike が効かない
    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft", search: "沖縄" }) }));
    expect(screen.queryByRole("heading", { name: "入力途中の旅行" })).not.toBeInTheDocument();
  });

  it("下書きは場所メモでも見つかる", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = vi.fn();
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel", location_name: "札幌" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft", search: "札幌" }) }));
    expect(screen.getByRole("heading", { name: "入力途中の旅行" })).toBeInTheDocument();
  });

  it("shows the saved draft instead of querying event rows when draft is selected", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = vi.fn();
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel", location_name: "札幌" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft" }) }));

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "入力途中の旅行" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toHaveAttribute(
      "href",
      "/events/new?resume=draft"
    );
  });

  it("redirects to the last available page when the requested page is out of range", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 15);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    await expect(EventsPage({ searchParams: Promise.resolve({ page: "3" }) })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/events?page=2");
  });

  it("passes an offset beyond the PostgreSQL integer range without overflowing", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 2_147_483_660);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ page: "214748366" }) }));

    expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", expect.objectContaining({
      p_limit: 10,
      p_offset: 2_147_483_650
    }));
  });
});
