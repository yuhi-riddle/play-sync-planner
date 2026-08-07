import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUserId, notFound, redirect } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient, getCurrentUserId }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound,
  redirect
}));
vi.mock("@/lib/actions/plan/plan-timetable", () => ({
  createPlanTimetableItemAction: vi.fn(),
  deletePlanTimetableItemAction: vi.fn(),
  updatePlanTimetableItemAction: vi.fn()
}));

import PlanTimetablePage from "@/app/plans/[planId]/timetable/page";

const planId = "plan-1";
const eventId = "event-1";
const ownerId = "owner-1";
const memberUserId = "member-1";
const outsiderId = "outsider-1";

// supabase-jsのクエリビルダーはメソッドチェーンの途中でも最後でもawaitできる
// （thenableな）ため、モックも同じ形にしておく（event-detail-page.test.tsx と同じ作法）。
function chain(result: unknown) {
  const handler: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in"]) {
    handler[method] = vi.fn(() => handler);
  }
  handler.single = vi.fn().mockResolvedValue(result);
  handler.maybeSingle = vi.fn().mockResolvedValue(result);
  handler.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return handler;
}

function participant(id: string, name: string, userId: string | null, status = "confirmed") {
  return { id, display_name: name, status, user_id: userId };
}

function basePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: planId,
    title: "夏合宿の計画",
    status: "date_confirmed",
    owner_user_id: ownerId,
    // JST 2026-08-15 13:00 - 19:00（単日）。
    confirmed_start_at: "2026-08-15T04:00:00+00:00",
    confirmed_end_at: "2026-08-15T10:00:00+00:00",
    events: [{ id: eventId, title: "夏合宿" }],
    participants: [participant("p1", "田中", ownerId), participant("p2", "鈴木", memberUserId)],
    ...overrides
  };
}

/**
 * plans / plan_timetable_items / event_members の3テーブルを1つの admin クライアントで返す。
 * ページは createSupabaseAdminClient() を1回しか呼ばないので、テーブル名で振り分ける。
 */
function mockSupabase({
  plan,
  items = [],
  membership = null
}: {
  plan: Record<string, unknown> | null;
  items?: unknown[];
  membership?: unknown;
}) {
  const from = vi.fn((table: string) => {
    if (table === "plans") return chain({ data: plan, error: null });
    if (table === "plan_timetable_items") return chain({ data: items, error: null });
    if (table === "event_members") return chain({ data: membership, error: null });
    throw new Error(`unexpected table: ${table}`);
  });
  createSupabaseAdminClient.mockReturnValue({ from });
  return { from };
}

describe("PlanTimetablePage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  describe("canView", () => {
    it("オーナーは見られる", async () => {
      mockSupabase({ plan: basePlan(), membership: { id: "m1" } });
      getCurrentUserId.mockResolvedValue(ownerId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("当日の進行表")).toBeInTheDocument();
      expect(notFound).not.toHaveBeenCalled();
    });

    it("この plan の participant として含まれていれば見られる（イベントメンバーかどうかは別問題）", async () => {
      mockSupabase({ plan: basePlan(), membership: null });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("当日の進行表")).toBeInTheDocument();
      expect(notFound).not.toHaveBeenCalled();
    });

    it("オーナーでも participant でもなければ404", async () => {
      mockSupabase({ plan: basePlan(), membership: null });
      getCurrentUserId.mockResolvedValue(outsiderId);

      await expect(PlanTimetablePage({ params: Promise.resolve({ planId }) })).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });

  describe("canEdit", () => {
    it("日程確定 × イベントメンバーなら追加フォームと削除ボタンを出す", async () => {
      mockSupabase({
        plan: basePlan(),
        items: [
          {
            id: "item-1",
            start_at: "2026-08-15T04:00:00+00:00",
            end_at: null,
            title: "集合",
            note: null,
            created_at: "2026-08-01T00:00:00+00:00",
            plan_timetable_item_assignees: []
          }
        ],
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("＋ 進行を追加")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "集合を削除" })).toBeInTheDocument();
    });

    it("日程確定でもイベントメンバーでなければ、閲覧できても編集UIは出さない", async () => {
      // 共有リンクから回答しただけのログイン済みユーザーを想定。participant 行はあるが
      // event_members には無い。canView は通るが canEdit は通らないことを固定する。
      mockSupabase({
        plan: basePlan(),
        items: [
          {
            id: "item-1",
            start_at: "2026-08-15T04:00:00+00:00",
            end_at: null,
            title: "集合",
            note: null,
            created_at: "2026-08-01T00:00:00+00:00",
            plan_timetable_item_assignees: []
          }
        ],
        membership: null
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("当日の進行表")).toBeInTheDocument();
      expect(screen.queryByText("＋ 進行を追加")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "集合を削除" })).not.toBeInTheDocument();
    });

    it("イベントメンバーでも日程が未確定なら編集UIは出さない", async () => {
      mockSupabase({
        plan: basePlan({ status: "adjusting", confirmed_start_at: null, confirmed_end_at: null }),
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.queryByText("＋ 進行を追加")).not.toBeInTheDocument();
    });
  });

  describe("ステータス文言", () => {
    it("未確定なら「閲覧のみ」の案内を出す", async () => {
      mockSupabase({
        plan: basePlan({ status: "adjusting", confirmed_start_at: null, confirmed_end_at: null }),
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("日程がまだ確定していないため、進行表は閲覧のみです。")).toBeInTheDocument();
    });

    it("中止済みなら「中止されています」の案内を出す（未確定とは文言を分ける）", async () => {
      mockSupabase({
        plan: basePlan({ status: "cancelled" }),
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.getByText("この日程調整は中止されています。進行表は閲覧のみです。")).toBeInTheDocument();
      expect(screen.queryByText("日程がまだ確定していないため、進行表は閲覧のみです。")).not.toBeInTheDocument();
    });

    it("確定済みなら閲覧のみの案内を出さない", async () => {
      mockSupabase({ plan: basePlan(), membership: { id: "m1" } });
      getCurrentUserId.mockResolvedValue(memberUserId);

      render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      expect(screen.queryByText("進行表は閲覧のみです。", { exact: false })).not.toBeInTheDocument();
    });
  });

  describe("defaultDate / eventDates", () => {
    it("開催期間の日付を PlanTimetableForm の日付選択肢として渡し、次の開始時刻を初期値にする", async () => {
      // 2日開催・行なし ⇒ nextStartAt は confirmed_start_at そのもの（初日 13:00）。
      mockSupabase({
        plan: basePlan({
          confirmed_start_at: "2026-08-15T04:00:00+00:00", // JST 2026-08-15 13:00
          confirmed_end_at: "2026-08-16T10:00:00+00:00" // JST 2026-08-16 19:00
        }),
        items: [],
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      const { container } = render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      const dateOptions = [...container.querySelectorAll('select[name="date"] option')].map(
        (option) => (option as HTMLOptionElement).value
      );
      expect(dateOptions).toEqual(["2026-08-15", "2026-08-16"]);

      // 一覧の各行にも編集フォーム（同じ name の入力欄）が並ぶので、name だけで引くと
      // 先頭の行の編集フォームを拾ってしまう。追加フォームの idPrefix で絞る。
      const dateSelect = container.querySelector("#timetable-new-date") as HTMLSelectElement;
      expect(dateSelect.value).toBe("2026-08-15");

      const startTimeInput = container.querySelector("#timetable-new-start-time") as HTMLInputElement;
      expect(startTimeInput.value).toBe("13:00");
    });

    it("最後の行が深夜まで伸びて次が開催期間の外に出たら、最終日の 23:59 に寄せる", async () => {
      // 2日目 23:30 の行の次は JST 2026-08-17 00:30＝開催期間の外。
      // 日付だけ最終日(08-16)に丸めて時刻を 00:30 のまま使うと、追加した行が
      // その日の先頭に入って一覧の最上部に出てしまう。時刻もその日の終わりに寄せる。
      mockSupabase({
        plan: basePlan({
          confirmed_start_at: "2026-08-15T04:00:00+00:00", // JST 2026-08-15 13:00
          confirmed_end_at: "2026-08-16T10:00:00+00:00" // JST 2026-08-16 19:00
        }),
        items: [
          {
            id: "item-late",
            start_at: "2026-08-16T14:30:00+00:00", // JST 2026-08-16 23:30
            end_at: null,
            title: "打ち上げ",
            note: null,
            created_at: "2026-08-01T00:00:00+00:00",
            plan_timetable_item_assignees: []
          }
        ],
        membership: { id: "m1" }
      });
      getCurrentUserId.mockResolvedValue(memberUserId);

      const { container } = render(await PlanTimetablePage({ params: Promise.resolve({ planId }) }));

      const dateSelect = container.querySelector("#timetable-new-date") as HTMLSelectElement;
      expect(dateSelect.value).toBe("2026-08-16");

      const startTimeInput = container.querySelector("#timetable-new-start-time") as HTMLInputElement;
      // 00:30 のままだと「日付は 08-16、時刻は 00:30」で既存行より前に入る。
      expect(startTimeInput.value).toBe("23:59");
      expect(startTimeInput.value).not.toBe("00:30");
    });
  });
});
