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

vi.mock("next/navigation", () => ({ notFound, redirect }));
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

function renderPage(searchParams: Record<string, string> = {}) {
  return PublicSettlementPage({
    params: Promise.resolve({ token: "tok-1" }),
    searchParams: Promise.resolve(searchParams)
  });
}

describe("PublicSettlementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
  });

  it("shows the logged-in participant's own settlement payment method form", async () => {
    mockLink(basePlan);
    mockCurrentUser("user-1");

    render(await renderPage());

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });

  // 共有リンクは入口でしかない。トークンだけで金額を読めてはいけない。
  it("未ログインならログインへ送る", async () => {
    mockLink(basePlan);
    mockCurrentUser(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=/s/tok-1/settlement");
  });

  it("参加者でないログインユーザーには清算額を見せない", async () => {
    mockLink(basePlan);
    mockCurrentUser("user-nobody");

    render(await renderPage());

    expect(screen.getByText(/参加者ではありません/)).toBeInTheDocument();
    expect(screen.queryByText("2,000円")).not.toBeInTheDocument();
  });

  /*
   * 以前は ?viewer= で誰にでもなりすませた。選ばせるのをやめ、
   * 本人はログインしているアカウントだけから決める。
   */
  it("viewer クエリでは本人を選ばせない", async () => {
    mockLink(basePlan);
    mockCurrentUser("user-nobody");

    render(await renderPage({ viewer: "p2" }));

    expect(screen.queryByText("あなたの支払い方法")).not.toBeInTheDocument();
    expect(screen.queryByText("あなたのお名前")).not.toBeInTheDocument();
    expect(screen.getByText(/参加者ではありません/)).toBeInTheDocument();
  });
});
