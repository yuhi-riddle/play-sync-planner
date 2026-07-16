import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser
}));

import { blockUserAction, unblockUserAction } from "@/lib/actions/connections";

const currentUserId = "11111111-1111-4111-8111-111111111111";
const blockedUserId = "22222222-2222-4222-8222-222222222222";

describe("blockUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole block operation to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await blockUserAction(blockedUserId);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("block_user_atomic", { target_user_id: blockedUserId });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("preserves the existing message when the target no longer shares an event", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        error: { code: "PSP01", message: "A shared event is required" }
      })
    });

    await expect(blockUserAction(blockedUserId)).rejects.toThrow(
      "共通のイベントに参加しているユーザーだけを操作できます"
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("uses the general block error for an unexpected database failure", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "database failure" } })
    });

    await expect(blockUserAction(blockedUserId)).rejects.toThrow("ブロックできませんでした");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("unblockUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: currentUserId });
  });

  it("removes only the current user's block and does not restore follows or favorites", async () => {
    const query = {
      delete: vi.fn(),
      eq: vi.fn()
    };
    query.delete.mockReturnValue(query);
    query.eq.mockReturnValueOnce(query).mockResolvedValueOnce({ error: null });
    const from = vi.fn(() => query);
    createSupabaseAdminClient.mockReturnValue({ from });

    await unblockUserAction(blockedUserId);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("user_blocks");
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenNthCalledWith(1, "blocker_user_id", currentUserId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "blocked_user_id", blockedUserId);
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });
});
