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
vi.mock("@/lib/actions/event/events", () => ({
  cancelEventAction: vi.fn(),
  completeEventAction: vi.fn(),
  snoozeEventWrapupAction: vi.fn()
}));
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

/**
 * グループ表示では「おわり」別枠クエリ（p_filter=completed/cancelled）が
 * メインクエリと同じ rpc モックを追加で叩く。フィルタを区別しないと、
 * どのテストでもメインの1件が「おわり」枠にも紛れ込んで二重表示になる。
 */
function createRpcResult(eventIds: string[], totalCount: number, filter = "active") {
  return vi.fn((_name: string, params: { p_filter: string }) => {
    if (params.p_filter !== filter) {
      return Promise.resolve({ data: [{ event_ids: [], total_count: 0 }], error: null });
    }
    return Promise.resolve({ data: [{ event_ids: eventIds, total_count: totalCount }], error: null });
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

function createEventLookupQuery(allEvents: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((_column: string, ids: string[]) =>
      Promise.resolve({ data: allEvents.filter((event) => ids.includes(event.id as string)), error: null })
    )
  };
}

function createGroupedRpc(byFilter: Record<string, { ids: string[]; total: number }>) {
  return vi.fn((_name: string, params: { p_filter: string }) => {
    const result = byFilter[params.p_filter] ?? { ids: [], total: 0 };
    return Promise.resolve({ data: [{ event_ids: result.ids, total_count: result.total }], error: null });
  });
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

  it("shows active events by default and shows the pinned draft card", async () => {
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

    // 下書きは状態タブが無くなった分、常時カードとして先頭に出る
    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toHaveAttribute("href", "/events/new?resume=draft");
    expect(screen.getByRole("heading", { name: "夏ライブ" })).toBeInTheDocument();
  });

  it("下書きは完了タブでも常時先頭に表示される", async () => {
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "完了イベント"), status: "done" }]);
    const rpc = createRpcResult(["event-1"], 1, "completed");
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "完了イベント" })).toBeInTheDocument();
  });

  it("あなたの番グループにはアクション文言だけを出し、場所・参加人数は出さない", async () => {
    const eventQuery = createEventQuery([{
      ...makeEvent("event-1", "週末の謎解き会"),
      category: "nazotoki",
      status: "interested",
      location_name: "新宿",
      event_members: [{ status: "joined" }],
      plans: []
    }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("あなたの番")).toBeInTheDocument();
    const eventCardLink = screen.getByRole("link", { name: /週末の謎解き会/ });
    expect(within(eventCardLink).getByText("▶ 日程調整を始める")).toBeInTheDocument();
    expect(within(eventCardLink).queryByText("新宿")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText(/参加 \d+人/)).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText("参加者待ち")).not.toBeInTheDocument();
  });

  it("カードの左端はカテゴリの色ドットのみで、テキストラベルは出さない", async () => {
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "夏合宿"), category: "travel" }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    const cardLink = screen.getByRole("link", { name: /夏合宿/ });
    expect(within(cardLink).queryByText("旅行")).not.toBeInTheDocument();
    const dot = cardLink.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-category-travel");
  });

  it("清算待ちイベントはあなたの番グループに入る", async () => {
    const pastPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "needed",
      confirmed_start_at: "2020-01-01T00:00:00Z",
      confirmed_end_at: "2020-01-01T00:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "清算待ちイベント"), plans: [pastPlan] }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("あなたの番")).toBeInTheDocument();
    const cardLink = screen.getByRole("link", { name: /清算待ちイベント/ });
    expect(within(cardLink).getByText("¥ 清算をまとめる")).toBeInTheDocument();
  });

  it("これからグループのカードは相対日付で出す", async () => {
    const confirmedPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "not_started",
      confirmed_start_at: "2026-07-07T10:00:00Z", // JST 2026/07/07 19:00, vitest.setup の now=2026-07-01 の6日後（火）
      confirmed_end_at: "2026-07-07T12:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([
      { ...makeEvent("event-1", "確定済みの集まり"), status: "confirmed", plans: [confirmedPlan] }
    ]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("開催予定")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /確定済みの集まり/ });
    expect(within(card).getByText("火 19:00")).toBeInTheDocument();
  });

  it("shows the draft card's status and category as shared Badge pills", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 0);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft" }) }));

    // ナビの状態チップにも「下書き」の文言があるため、下書きカードのリンク内に絞って取得する
    const draftCard = screen.getByRole("link", { name: /続きから入力/ });
    const draftBadge = within(draftCard).getByText("下書き");
    // text-caption は共有Badge固有のクラス。旧・自前実装は text-xs だったため、これがないと
    // Badge化が元に戻っても検知できない（最終レビューで指摘）。
    expect(draftBadge).toHaveClass("bg-honey/18", "text-honey-ink", "text-caption");

    const categoryBadge = within(draftCard).getByText("旅行");
    expect(categoryBadge).toHaveClass("bg-mist", "text-pine", "border-moss/30");
  });

  it("日程が未設定でも「あなたの番」のアクション文言だけを出す", async () => {
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

    expect(screen.queryByText("参加 1人")).not.toBeInTheDocument();
    const cardLink = screen.getByRole("link", { name: /まだ何も決まっていない会/ });
    expect(within(cardLink).getByText("▶ 日程調整を始める")).toBeInTheDocument();
  });

  it("asks the database for one page and fetches only the returned event ids", async () => {
    const eventQuery = createEventQuery([
      makeEvent("event-2", "2番目"),
      makeEvent("event-1", "1番目")
    ]);
    const rpc = createRpcResult(["event-1", "event-2"], 1001, "completed");
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
      p_query: null,
      p_display_state: "all"
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

  it("進行状態はデータベースに渡す", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 0);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "active", display: "answer_waiting" }) }));

    expect(rpc).toHaveBeenCalledWith(
      "list_owned_event_ids",
      expect.objectContaining({ p_display_state: "answer_waiting" })
    );
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

  it("期日超過・清算不要で30日以上たったイベントに確認帯を出す", async () => {
    const longAgo = new Date("2026-05-01T10:00:00Z").toISOString(); // vitest.setup の now=2026-07-01 より60日前
    const eventQuery = createEventQuery([
      {
        ...makeEvent("event-1", "先月の集まり"),
        status: "confirmed",
        wrapup_snoozed_until: null,
        plans: [
          {
            id: "plan-1",
            status: "date_confirmed",
            settlement_status: "not_needed",
            confirmed_start_at: longAgo,
            confirmed_end_at: longAgo,
            is_all_day: false
          }
        ]
      }
    ]);
    const rpc = createRpcResult(["event-1"], 1, "completed");
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

    expect(screen.getByText(/開催おつかれさまでした/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完了にする" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "後で" })).toBeInTheDocument();
  });

  it("期日超過でも30日たっていなければ確認帯を出さない", async () => {
    const recent = new Date("2026-06-25T10:00:00Z").toISOString(); // now の6日前
    const eventQuery = createEventQuery([
      {
        ...makeEvent("event-1", "先週の集まり"),
        status: "confirmed",
        wrapup_snoozed_until: null,
        plans: [
          {
            id: "plan-1",
            status: "date_confirmed",
            settlement_status: "not_needed",
            confirmed_start_at: recent,
            confirmed_end_at: recent,
            is_all_day: false
          }
        ]
      }
    ]);
    const rpc = createRpcResult(["event-1"], 1, "completed");
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

    expect(screen.queryByText(/開催おつかれさまでした/)).not.toBeInTheDocument();
  });

  it("グループはすべて開閉できる。あなたの番/待ち/これからは既定で開き、おわりは既定で閉じる", async () => {
    const eventQuery = createEventLookupQuery([
      makeEvent("event-1", "調整中の会"),
      { ...makeEvent("done-1", "完了した会1"), status: "done" }
    ]);
    const rpc = createGroupedRpc({
      active: { ids: ["event-1"], total: 1 },
      completed: { ids: ["done-1"], total: 1 },
      cancelled: { ids: [], total: 0 }
    });
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    const { container } = render(await EventsPage({ searchParams: Promise.resolve({}) }));

    const detailsList = Array.from(container.querySelectorAll("details"));
    const yourTurnDetails = detailsList.find((el) => el.textContent?.includes("あなたの番"));
    const doneDetails = detailsList.find((el) => el.textContent?.includes("おわり"));

    expect(yourTurnDetails).toHaveAttribute("open");
    expect(doneDetails).not.toHaveAttribute("open");

    const summary = doneDetails?.querySelector("summary");
    expect(summary).toHaveClass("list-none", "[&::-webkit-details-marker]:hidden");
  });

  it("おわりグループは完了・中止を合算した別枠クエリから出す", async () => {
    const eventQuery = createEventLookupQuery([
      makeEvent("event-1", "調整中の会"),
      { ...makeEvent("done-1", "完了した会1"), status: "done" },
      { ...makeEvent("done-2", "中止した会1"), status: "cancelled" }
    ]);
    const rpc = createGroupedRpc({
      active: { ids: ["event-1"], total: 1 },
      completed: { ids: ["done-1"], total: 1 },
      cancelled: { ids: ["done-2"], total: 1 }
    });
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("おわり")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "調整中の会" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "完了した会1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "中止した会1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("おわりの合計が5件を超えたら「もっと見る」を出す", async () => {
    const doneEvents = Array.from({ length: 5 }, (_, index) => ({
      ...makeEvent(`done-${index}`, `完了した会${index}`),
      status: "done"
    }));
    const eventQuery = createEventLookupQuery(doneEvents);
    const rpc = createGroupedRpc({
      active: { ids: [], total: 0 },
      completed: { ids: doneEvents.map((event) => event.id), total: 6 },
      cancelled: { ids: [], total: 0 }
    });
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "もっと見る" })).toHaveAttribute("href", "/events?status=completed");
  });
});
