import React from "react";
import { describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUserId, notFound } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  getCurrentUserId,
  hasSupabaseAdminEnv: vi.fn(() => true)
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound,
  redirect: vi.fn()
}));

import SettlementPage from "@/app/plans/[planId]/settlement/page";

function mockPlanResult(result: { data: unknown; error: unknown }) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result)
    }))
  });
}

describe("SettlementPage のクエリ失敗", () => {
  it("列が無いなどのクエリエラーは404にせず投げ直す", async () => {
    vi.stubGlobal("React", React);
    getCurrentUserId.mockResolvedValue("user-1");
    mockPlanResult({
      data: null,
      error: { code: "42703", message: "column participants.settlement_payment_method does not exist" }
    });

    await expect(SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) })).rejects.toThrow(
      /settlement_payment_method/
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("行が無いだけなら従来どおり404にする", async () => {
    vi.stubGlobal("React", React);
    getCurrentUserId.mockResolvedValue("user-1");
    mockPlanResult({ data: null, error: null });

    await expect(SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
