import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, createSupabaseAdminClient, getCurrentActiveUser, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, createSupabaseAdminClient, getCurrentActiveUser }));

import { updateProfileAction } from "@/lib/actions/account/profile";
import { PROFILE_ACTION_INITIAL_STATE } from "@/lib/domain/account/profile";

/** event_members の一括更新だけを見る admin クライアント。 */
function adminClient({ error = null }: { error?: { message: string } | null } = {}) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));

  return { client: { from }, from, update, eq };
}

describe("updateProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: "user-1", email: "user@example.com", user_metadata: {} });
    createSupabaseAdminClient.mockReturnValue(adminClient().client);
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
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => ({ ...profileQuery, upsert })),
      auth: { updateUser },
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
    expect(revalidatePath).not.toHaveBeenCalledWith("/settings");
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        nickname: "ゆうやん",
        profile_onboarding_completed_at: "2026-07-15T00:00:00Z"
      }
    });
  });

  /*
   * event_members.display_name は参加した時点のコピー。ここで揃えないと、
   * 古いイベントだけ前の名前が出続ける（同じ人が2つの名前で並ぶ）。
   */
  it("改名したら、参加中のイベントに残っている表示名も揃える", async () => {
    const admin = adminClient();
    createSupabaseAdminClient.mockReturnValue(admin.client);
    mockProfileSave();

    const formData = new FormData();
    formData.set("nickname", "ゆうひ");
    formData.set("mode", "settings");

    await updateProfileAction(PROFILE_ACTION_INITIAL_STATE, formData);

    expect(admin.from).toHaveBeenCalledWith("event_members");
    expect(admin.update).toHaveBeenCalledWith({ display_name: "ゆうひ" });
    expect(admin.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  /*
   * participants.display_name は残す。清算の相手が誰か分からなくなるため、
   * プライバシーポリシーで残すと明記している。
   */
  it("日程調整の参加者名には手を出さない", async () => {
    const admin = adminClient();
    createSupabaseAdminClient.mockReturnValue(admin.client);
    mockProfileSave();

    const formData = new FormData();
    formData.set("nickname", "ゆうひ");
    formData.set("mode", "settings");

    await updateProfileAction(PROFILE_ACTION_INITIAL_STATE, formData);

    expect(admin.from).not.toHaveBeenCalledWith("participants");
  });

  // 表示名の追随は本筋ではない。ここで落ちても保存そのものは成功している。
  it("表示名の同期に失敗しても、保存は成功として返す", async () => {
    createSupabaseAdminClient.mockReturnValue(adminClient({ error: { message: "boom" } }).client);
    mockProfileSave();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const formData = new FormData();
    formData.set("nickname", "ゆうひ");
    formData.set("mode", "settings");

    await expect(updateProfileAction(PROFILE_ACTION_INITIAL_STATE, formData)).resolves.toEqual({
      status: "success",
      message: "プロフィールを保存しました。"
    });

    consoleError.mockRestore();
  });
});

/** プロフィール保存が成功する状態のサーバークライアントを立てる。 */
function mockProfileSave() {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_path: null, onboarding_completed_at: null }, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null })
  };

  createSupabaseServerClient.mockResolvedValue({
    from: vi.fn(() => profileQuery),
    auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
    storage: { from: vi.fn() }
  });
}
