import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUserId } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  getCurrentUserId
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map([["host", "localhost:3000"]]))
}));
vi.mock("@/lib/actions/settlement/settlements", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  recordSettlementPaymentAction: vi.fn(),
  confirmSettlementPaymentAction: vi.fn(),
  updateSettlementPaymentInstructionAction: vi.fn(),
  updateParticipantSettlementPaymentMethodAction: vi.fn(),
  markSettlementReminderSentAction: vi.fn()
}));

import SettlementPage from "@/app/plans/[planId]/settlement/page";

function participant(id: string, name: string, userId: string, settlementPaymentMethod: string | null = null) {
  return { id, display_name: name, user_id: userId, settlement_payment_method: settlementPaymentMethod };
}

type ExpenseSplitRow = {
  id: string;
  participant_id: string;
  amount: number;
  participants: ReturnType<typeof participant>;
};

function basePlan(settlements: Array<Record<string, unknown>>, expenseSplits: ExpenseSplitRow[] = []) {
  return {
    id: "plan-1",
    title: "夏祭りの計画",
    owner_user_id: "user-1",
    events: [{ id: "event-1", title: "夏祭り" }],
    share_links: [{ token: "tok-1", purpose: "answer" }],
    participants: [participant("p1", "田中", "user-1", "PayPay"), participant("p2", "鈴木", "user-2")],
    expenses: [
      {
        id: "expense-1",
        title: "チケット代",
        amount: 7200,
        paid_at: "2026-07-01T00:00:00Z",
        memo: null,
        payment_method: null,
        payment_url: null,
        is_important: false,
        payer_participant_id: "p1",
        payer: participant("p1", "田中", "user-1"),
        expense_splits: expenseSplits
      }
    ],
    settlements,
    settlement_reminder_logs: []
  };
}

function mockPlan(plan: Record<string, unknown>) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: plan, error: null })
    }))
  });
}

describe("SettlementPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    getCurrentUserId.mockResolvedValue("user-1");
  });

  it("emphasizes the remaining amount and hides the complete badge while unpaid", async () => {
    const plan = basePlan([
      {
        id: "settlement-1",
        amount: 2000,
        status: "unpaid",
        payment_method: null,
        payment_url: null,
        memo: null,
        paid_at: null,
        confirmed_at: null,
        from_participant: participant("p1", "田中", "user-1"),
        to_participant: participant("p2", "鈴木", "user-2"),
        settlement_payments: []
      }
    ]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    expect(screen.getByText("立替合計")).toBeInTheDocument();
    expect(screen.getByText("清算残額")).toBeInTheDocument();
    expect(screen.getByText("支払い済み")).toBeInTheDocument();
    expect(screen.getByText("参加者")).toBeInTheDocument();

    const remainingAmountRow = screen.getByText("清算残額").closest("div")?.parentElement as HTMLElement;
    expect(within(remainingAmountRow).getByText("2,000円").className).toMatch(/text-\[2\.5rem\]/);
    expect(within(remainingAmountRow).queryByText("清算完了")).not.toBeInTheDocument();
  });

  it("shows a settlement complete badge once nothing remains", async () => {
    const plan = basePlan([
      {
        id: "settlement-1",
        amount: 2000,
        status: "confirmed",
        payment_method: null,
        payment_url: null,
        memo: null,
        paid_at: "2026-07-02T00:00:00Z",
        confirmed_at: "2026-07-02T00:00:00Z",
        from_participant: participant("p1", "田中", "user-1"),
        to_participant: participant("p2", "鈴木", "user-2"),
        settlement_payments: [
          {
            id: "payment-1",
            amount: 2000,
            payment_method: null,
            payment_url: null,
            memo: null,
            paid_at: "2026-07-02T00:00:00Z",
            confirmed_at: "2026-07-02T00:00:00Z",
            paid_by: participant("p1", "田中", "user-1")
          }
        ]
      }
    ]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    const remainingAmountRow = screen.getByText("清算残額").closest("div")?.parentElement as HTMLElement;
    expect(within(remainingAmountRow).getByText("清算完了")).toBeInTheDocument();
  });

  it("shows the logged-in participant's own settlement payment method form when they are a creditor", async () => {
    const plan = basePlan([
      {
        id: "settlement-1",
        amount: 2000,
        status: "unpaid",
        payment_method: null,
        payment_url: null,
        memo: null,
        paid_at: null,
        confirmed_at: null,
        from_participant: participant("p2", "鈴木", "user-2"),
        to_participant: participant("p1", "田中", "user-1", "PayPay"),
        settlement_payments: []
      }
    ]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });

  it("does not show the settlement payment method form when the viewer has no settlement pairs", async () => {
    const plan = basePlan([]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    expect(screen.queryByText("あなたの受け取り方法")).not.toBeInTheDocument();
    expect(screen.queryByText("あなたの支払い方法")).not.toBeInTheDocument();
  });

  it("uses the receiving participant's settlement_payment_method (not the settlement row's own field) for the missing-instructions banner and the payment request message", async () => {
    const plan = basePlan([
      {
        id: "settlement-1",
        amount: 2000,
        status: "unpaid",
        payment_method: null,
        payment_url: null,
        memo: null,
        paid_at: null,
        confirmed_at: null,
        from_participant: participant("p2", "鈴木", "user-2"),
        to_participant: participant("p1", "田中", "user-1", "PayPay"),
        settlement_payments: []
      }
    ]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    expect(screen.queryByText("受け取り方法が未設定の清算があります", { exact: false })).not.toBeInTheDocument();

    const message = screen.getByLabelText("支払い依頼文面") as HTMLTextAreaElement;
    expect(message.value).toContain("支払い方法: PayPay");
  });

  /*
   * 受け取り方法は本人しか設定できない（updatePublicParticipantSettlementPaymentMethodAction は
   * 自分の行だけ）。この画面を見ている主催者に「送金先を入力してから」と促しても、その操作は無い。
   */
  it("受け取り方法が未設定のとき、設定できるのは本人だと案内する", async () => {
    const plan = basePlan([
      {
        id: "settlement-1",
        amount: 2000,
        status: "unpaid",
        payment_method: null,
        payment_url: null,
        memo: null,
        paid_at: null,
        confirmed_at: null,
        from_participant: participant("p2", "鈴木", "user-2"),
        to_participant: participant("p1", "田中", "user-1"),
        settlement_payments: []
      }
    ]);
    mockPlan(plan);

    render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

    const banner = screen.getByText("受け取り方法が未設定の清算があります", { exact: false });
    expect(banner).toHaveTextContent("受け取る本人しか設定できない");
    expect(banner).not.toHaveTextContent("送金先を入力してから");
  });

  describe("立替の編集フォームが開くときの割り方", () => {
    function planWithSplits(splits: Array<{ participantId: string; amount: number }>) {
      return basePlan(
        [],
        splits.map((split, index) => ({
          id: `split-${index}`,
          participant_id: split.participantId,
          amount: split.amount,
          participants: participant(split.participantId, split.participantId === "p1" ? "田中" : "鈴木", "user-1")
        }))
      );
    }

    function editForm() {
      return screen.getByText("内容を編集").closest("details") as HTMLElement;
    }

    it("均等割りで作った経費は均等割りのまま開く", async () => {
      // 立替 7,200円 を2人で均等 -> 3,600円ずつ
      mockPlan(planWithSplits([
        { participantId: "p1", amount: 3600 },
        { participantId: "p2", amount: 3600 }
      ]));

      render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

      expect(within(editForm()).getByRole("button", { name: "割り方を変える" })).toBeInTheDocument();
      expect(within(editForm()).getByLabelText("均等割り")).toBeChecked();
    });

    it("バラバラの負担額で作った経費は個別金額で開く", async () => {
      mockPlan(planWithSplits([
        { participantId: "p1", amount: 5000 },
        { participantId: "p2", amount: 2200 }
      ]));

      render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

      expect(within(editForm()).queryByRole("button", { name: "割り方を変える" })).not.toBeInTheDocument();
      expect(within(editForm()).getByLabelText("個別金額")).toBeChecked();
      expect(within(editForm()).getByLabelText("田中 の負担額")).toHaveValue(5000);
    });
  });
});
