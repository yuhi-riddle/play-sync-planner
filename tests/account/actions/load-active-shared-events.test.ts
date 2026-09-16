import { describe, expect, it, vi } from "vitest";

const { getCurrentActiveUser, createSupabaseServerClient, redirect } = vi.hoisted(() => ({
  getCurrentActiveUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentActiveUser,
  createSupabaseServerClient,
  createSupabaseAdminClient: vi.fn()
}));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: vi.fn()
}));

import { loadActiveSharedEventsAction } from "@/lib/actions/account/connections";

describe("loadActiveSharedEventsAction", () => {
  it("list_active_shared_eventsを呼び、ActiveSharedEventの配列に変換する", async () => {
    getCurrentActiveUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ event_id: "event-1", title: "夏の集まり", display_state: "event_waiting" }],
      error: null
    });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222");

    expect(rpc).toHaveBeenCalledWith("list_active_shared_events", {
      p_other_user_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(result).toEqual([{ eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" }]);
  });

  it("未ログインならログイン画面へredirectする", async () => {
    getCurrentActiveUser.mockResolvedValue(null);
    redirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await expect(
      loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222")
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("RPCがエラーを返したら例外を投げる", async () => {
    getCurrentActiveUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await expect(
      loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222")
    ).rejects.toThrow("進行中の共通イベントを読み込めませんでした");
  });
});
