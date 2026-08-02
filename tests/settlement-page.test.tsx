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
vi.mock("@/lib/actions/settlements", () => ({
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

function basePlan(settlements: Array<Record<string, unknown>>) {
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
        expense_splits: []
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
});
