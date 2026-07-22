import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser }));

import { updateProfileAction } from "@/lib/actions/profile";
import { PROFILE_ACTION_INITIAL_STATE } from "@/lib/domain/profile";

describe("updateProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com", user_metadata: {} });
  });

  it("returns a useful message when the profiles migration is not applied", async () => {
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST205", message: "profiles missing" } })
    };
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn(() => profileQuery) });
    const formData = new FormData();
    formData.set("nickname", "ゆうやん");
    formData.set("mode", "settings");

    await expect(updateProfileAction(PROFILE_ACTION_INITIAL_STATE, formData)).resolves.toEqual({
      status: "error",
      message: "プロフィール機能の準備がまだ完了していません。管理者がmigration 019を適用してください。"
    });
  });

  it("saves a trimmed nickname and returns success from settings", async () => {
    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_path: null, onboarding_completed_at: "2026-07-15T00:00:00Z" }, error: null })
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({ ...profileQuery, upsert })),
      auth: { getUser, updateUser },
      rpc,
      storage: { from: vi.fn() }
    });
    const formData = new FormData();
    formData.set("nickname", "  ゆうやん  ");
    formData.set("mode", "settings");

    await expect(updateProfileAction(PROFILE_ACTION_INITIAL_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "プロフィールを保存しました。"
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", nickname: "ゆうやん", avatar_path: null }),
      { onConflict: "user_id" }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(rpc).toHaveBeenCalledWith("consume_authenticated_rate_limit", {
      operation: "profile_update"
    });
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        nickname: "ゆうやん",
        profile_onboarding_completed_at: "2026-07-15T00:00:00Z"
      }
    });
  });
});
