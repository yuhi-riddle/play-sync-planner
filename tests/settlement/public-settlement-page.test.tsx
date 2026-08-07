import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUserId } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  getCurrentUserId,
  hasSupabaseAdminEnv: vi.fn(() => true)
}));
vi.mock("@/lib/actions/settlement/settlements", () => ({
  recordPublicSettlementPaymentAction: vi.fn(),
  updatePublicParticipantSettlementPaymentMethodAction: vi.fn()
}));

import PublicSettlementPage from "@/app/s/[token]/settlement/page";

const basePlan = {
  id: "plan-1",
  title: "夏祭りの計画",
  confirmed_start_at: null,
  confirmed_end_at: null,
  is_all_day: false,
  events: [{ title: "夏祭り", location_name: null }],
  participants: [
    { id: "p1", display_name: "田中", user_id: "user-1", settlement_payment_method: "PayPay" },
    { id: "p2", display_name: "鈴木", user_id: "user-2", settlement_payment_method: null }
  ],
  expenses: [],
  settlements: [
    {
      id: "settlement-1",
      amount: 2000,
      payment_method: null,
      payment_url: null,
      memo: null,
      from_participant: { id: "p2", display_name: "鈴木", user_id: "user-2", settlement_payment_method: null },
      to_participant: { id: "p1", display_name: "田中", user_id: "user-1", settlement_payment_method: "PayPay" },
      settlement_payments: []
    }
  ]
};

function mockLink(plan: Record<string, unknown> | null) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { token: "tok-1", status: "open", plans: plan } })
    }))
  });
}

function mockCurrentUser(userId: string | null) {
  getCurrentUserId.mockResolvedValue(userId);
}

describe("PublicSettlementPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("shows the logged-in participant's own settlement payment method form", async () => {
    mockLink(basePlan);
    mockCurrentUser("user-1");

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });

  it("shows a name picker when nobody is logged in and no viewer is selected", async () => {
    mockLink(basePlan);
    mockCurrentUser(null);

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("あなたのお名前")).toBeInTheDocument();
  });

  it("resolves the viewer from the viewer query parameter when not logged in", async () => {
    mockLink(basePlan);
    mockCurrentUser(null);

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({ viewer: "p2" })
      })
    );

    expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
  });
});
