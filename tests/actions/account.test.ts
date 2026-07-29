import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser, hasSupabaseAdminEnv, redirect, revalidatePath } =
  vi.hoisted(() => ({
    createSupabaseAdminClient: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    getCurrentUser: vi.fn(),
    hasSupabaseAdminEnv: vi.fn().mockReturnValue(true),
    redirect: vi.fn(),
    revalidatePath: vi.fn()
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv
}));

import { withdrawAccountAction } from "@/lib/actions/account";
import { WITHDRAWN_DISPLAY_NAME } from "@/lib/domain/account";

const userId = "11111111-1111-4111-8111-111111111111";

type Recorded = { deletes: string[]; updates: { table: string; values: Record<string, unknown> }[] };

function createAdminMock() {
  const recorded: Recorded = { deletes: [], updates: [] };
  const removedAvatars: string[][] = [];
  const updateUserById = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.delete = vi.fn(() => {
      recorded.deletes.push(table);
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      recorded.updates.push({ table, values });
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });

  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn(async (paths: string[]) => {
        removedAvatars.push(paths);
        return { error: null };
      })
    }))
  };

  return { client: { from, storage, auth: { admin: { updateUserById } } }, recorded, removedAvatars, updateUserById };
}

function createServerMock(profile: { nickname: string; avatar_path: string | null } | null) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data: profile, error: null }));

  return { client: { from: vi.fn(() => builder), auth: { signOut } }, signOut };
}

function confirmationFormData(value: string) {
  const formData = new FormData();
  formData.set("confirmation", value);
  return formData;
}

describe("withdrawAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasSupabaseAdminEnv.mockReturnValue(true);
    getCurrentUser.mockResolvedValue({ id: userId, user_metadata: {} });
  });

  it("表示名の確認が一致しないと何も消さない", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    const result = await withdrawAccountAction({ status: "idle" }, confirmationFormData("ちがう名前"));

    expect(result.status).toBe("error");
    expect(admin.recorded.deletes).toEqual([]);
    expect(admin.recorded.updates).toEqual([]);
    expect(server.signOut).not.toHaveBeenCalled();
  });

  it("つながり・通知・連携などの個人データを物理削除する", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    for (const table of [
      "user_connections",
      "user_favorites",
      "user_blocks",
      "event_user_invitations",
      "notifications",
      "event_drafts",
      "calendar_integrations"
    ]) {
      expect(admin.recorded.deletes).toContain(table);
    }
  });

  it("イベントと清算の記録は消さない", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    for (const table of ["events", "plans", "expenses", "settlements", "participants", "user_consents"]) {
      expect(admin.recorded.deletes).not.toContain(table);
    }
  });

  it("プロフィールとイベントメンバーの表示名を匿名化する", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: `${userId}/avatar.png` });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    expect(admin.recorded.updates).toContainEqual({
      table: "profiles",
      values: expect.objectContaining({
        nickname: WITHDRAWN_DISPLAY_NAME,
        avatar_path: null,
        deleted_at: expect.any(String)
      })
    });
    expect(admin.recorded.updates).toContainEqual({
      table: "event_members",
      values: { display_name: WITHDRAWN_DISPLAY_NAME }
    });
    expect(admin.removedAvatars).toEqual([[`${userId}/avatar.png`]]);
  });

  it("再ログインを止めるため、認証側にも退会印を付けてサインアウトする", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    expect(admin.updateUserById).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          nickname: WITHDRAWN_DISPLAY_NAME,
          withdrawn_at: expect.any(String)
        })
      })
    );
    expect(server.signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login?withdrawn=1");
  });
});
