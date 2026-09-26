import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, notFound, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT;${path}`);
  })
}));

vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv: () => true }));
vi.mock("@/components/account/connection-group-detail", () => ({ ConnectionGroupDetail: () => null }));

import ConnectionGroupPage from "@/app/connections/groups/[groupId]/page";

const groupId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
});

describe("ConnectionGroupPage", () => {
  it("UUID でない ID は RPC を呼ばずに404", async () => {
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId: "x" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("自分のグループでなければ（RPC が空なら）404", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("未ログインはログイン画面へ", async () => {
    getCurrentUserId.mockResolvedValue(null);
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow(
      `NEXT_REDIRECT;/login?next=%2Fconnections%2Fgroups%2F${groupId}`
    );
  });
});
