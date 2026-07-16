import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUser, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient: vi.fn(),
  getCurrentUser
}));

import { unblockUserAction } from "@/lib/actions/connections";

const currentUserId = "11111111-1111-4111-8111-111111111111";
const blockedUserId = "22222222-2222-4222-8222-222222222222";

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
