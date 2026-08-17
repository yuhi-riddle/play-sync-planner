import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, createSupabaseAdminClient, getCurrentUserId } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  createSupabaseAdminClient,
  getCurrentUserId
}));
vi.mock("@/lib/actions/event/event-members", () => ({
  closeEventInvitesAction: vi.fn(),
  revokeAndCreateEventInviteAction: vi.fn()
}));
vi.mock("@/lib/actions/event/event-messages", () => ({ createEventMessageAction: vi.fn() }));
vi.mock("@/lib/actions/account/connections", () => ({ createEventUserInvitationsAction: vi.fn() }));
vi.mock("@/lib/actions/event/event-tasks", () => ({
  createEventTaskAction: vi.fn(),
  deleteEventTaskAction: vi.fn(),
  toggleEventTaskDoneAction: vi.fn(),
  updateEventTaskAssigneeAction: vi.fn()
}));
vi.mock("@/lib/actions/event/events", () => ({
  cancelEventAction: vi.fn(),
  duplicateEventAction: vi.fn()
}));

import EventDetailPage from "@/app/events/[eventId]/page";

// supabase-jsのクエリビルダーはメソッドチェーンの途中でも最後でもawaitできる
// （thenableな）ため、モックも同じ形にしておく。
function chain(result: unknown) {
  const handler: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "in", "or"]) {
    handler[method] = vi.fn(() => handler);
  }
  handler.single = vi.fn().mockResolvedValue(result);
  handler.maybeSingle = vi.fn().mockResolvedValue(result);
  handler.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return handler;
}

function cancelledEvent() {
  return {
    id: "event-1",
    title: "夏の花火大会",
    status: "cancelled",
    owner_user_id: "owner-1",
    category: "other",
    location_name: null,
    url: null,
    memo: null,
    plans: []
  };
}

function mockServerClient(event: Record<string, unknown>, invite: Record<string, unknown> | null = null) {
  createSupabaseServerClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "events") return chain({ data: event, error: null });
      if (table === "event_invite_links") return chain({ data: invite, error: null });
      throw new Error(`unexpected table: ${table}`);
    })
  });
}

function mockAdminClient({ memberCount = 0, membershipRow = null }: { memberCount?: number; membershipRow?: unknown }) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "event_members") {
        return {
          select: vi.fn((columns: string) =>
            columns === "id" ? chain({ count: memberCount }) : chain({ data: membershipRow, error: null })
          )
        };
      }
      throw new Error(`unexpected admin table: ${table}`);
    })
  });
}

describe("EventDetailPage - 終了状態のイベント", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  it("中止したイベントでは、日程調整を始めるボタンと募集中の案内文を出さない", async () => {
    const event = cancelledEvent();
    // 招待を締め切り済みにしておく。招待がない（＝canStartAdjustmentが元々false）せいで
    // リンクが出ていないだけ、という偽陰性を避け、終了状態チェックそのものを検証する。
    mockServerClient(event, { token: "invite-1", status: "closed" });
    mockAdminClient({ memberCount: 3, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.queryByRole("link", { name: "日程調整を始める" })).not.toBeInTheDocument();
    expect(screen.queryByText("日程調整を始めると、候補日時を入力できます。")).not.toBeInTheDocument();
    expect(screen.queryByText("参加者を集めたら、参加受付を終了して日程調整へ進みます。")).not.toBeInTheDocument();
    expect(screen.getByText("夏の花火大会")).toBeInTheDocument();
  });

  it("中止したイベントでは、参加者タブの「準備中」「募集中」ラベルも出さない", async () => {
    const event = cancelledEvent();
    mockServerClient(event);
    mockAdminClient({ memberCount: 3, membershipRow: null });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({ tab: "members" })
      })
    );

    expect(screen.queryByText("日程調整の準備中")).not.toBeInTheDocument();
    expect(screen.queryByText("参加者を募集中")).not.toBeInTheDocument();
  });

  it("中止したイベントでプランがなければ、「日程調整」の見出しも出さない", async () => {
    const event = cancelledEvent();
    mockServerClient(event);
    mockAdminClient({ memberCount: 3, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.queryByRole("heading", { name: "日程調整" })).not.toBeInTheDocument();
  });

  it("中止したイベントでもプランがあれば、「日程調整」の見出しは出す", async () => {
    const event = {
      ...cancelledEvent(),
      plans: [{ id: "plan-1", title: "候補A", status: "date_confirmed", confirmed_start_at: null, answer_deadline_at: null }]
    };
    mockServerClient(event);
    mockAdminClient({ memberCount: 3, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByRole("heading", { name: "日程調整" })).toBeInTheDocument();
  });
});

describe("EventDetailPage - 重複実装解消（Phase 5）", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  function eventWithPlan() {
    return {
      id: "event-1",
      title: "夏合宿",
      status: "date_confirmed",
      owner_user_id: "owner-1",
      category: "other",
      location_name: null,
      url: null,
      memo: null,
      plans: [
        {
          id: "plan-1",
          title: "候補A",
          status: "date_confirmed",
          confirmed_start_at: null,
          answer_deadline_at: null
        }
      ]
    };
  }

  it("プランカードは共有Cardと同じクラス構成（bg-surface / rounded-card / shadow-raise）を持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const planCard = screen.getByRole("link", { name: /候補A/ });
    expect(planCard).toHaveClass("bg-surface", "rounded-card", "shadow-raise");
    expect(planCard).not.toHaveClass("bg-white");
  });

  it("「このメンバーでもう一度」ボタンはSubmitButton由来のクラスを持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: { user_id: "member-1" } });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const duplicateButton = screen.getByRole("button", { name: /このメンバーでもう一度/ });
    // SubmitButtonはaria-busyを常に持つ（useFormStatusのpending状態を反映するため）。
    // 独自実装のbuttonにはこの属性がなく、Badge化テスト同様の「実装が元に戻っても検知できる」観点。
    expect(duplicateButton).toHaveAttribute("aria-busy", "false");
    expect(duplicateButton).toHaveClass("border-line-strong");
  });

  it("「日程調整」見出しはSectionHeading由来のtext-titleクラスを持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const heading = screen.getByRole("heading", { name: "日程調整" });
    expect(heading).toHaveClass("text-title");
    expect(heading).not.toHaveClass("text-xl");
  });

  it("「参加者」見出しはSectionHeading化されても、参加人数と募集状態の表示を保つ", async () => {
    const event = { ...eventWithPlan(), status: "participants_open" };
    mockServerClient(event);
    mockAdminClient({ memberCount: 4, membershipRow: null });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({ tab: "members" })
      })
    );

    const heading = screen.getByRole("heading", { name: "参加者" });
    expect(heading).toHaveClass("text-title");
    expect(screen.getByText("参加済み 4人")).toBeInTheDocument();
  });
});
