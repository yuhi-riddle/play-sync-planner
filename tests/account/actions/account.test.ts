import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv,
  markAccountWithdrawn,
  redirect,
  revalidatePath
} =
  vi.hoisted(() => ({
    createSupabaseAdminClient: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    getCurrentUser: vi.fn(),
    hasSupabaseAdminEnv: vi.fn().mockReturnValue(true),
    markAccountWithdrawn: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn()
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/withdrawal-mark", () => ({ markAccountWithdrawn }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv
}));

import { withdrawAccountAction } from "@/lib/actions/account/account";
import { WITHDRAWN_DISPLAY_NAME } from "@/lib/domain/account/account";

const userId = "11111111-1111-4111-8111-111111111111";

type Recorded = {
  deletes: string[];
  updates: { table: string; values: Record<string, unknown> }[];
  rpcCalls: { name: string; args: unknown }[];
};

function createAdminMock(overrides: { rpcError?: unknown; profileUpdateError?: unknown } = {}) {
  const recorded: Recorded = { deletes: [], updates: [], rpcCalls: [] };
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
    builder.then = (resolve: (value: { error: unknown }) => unknown) =>
      Promise.resolve({ error: table === "profiles" ? overrides.profileUpdateError ?? null : null }).then(resolve);
    return builder;
  });

  const rpc = vi.fn(async (name: string, args: unknown) => {
    recorded.rpcCalls.push({ name, args });
    return { data: null, error: overrides.rpcError ?? null };
  });

  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn(async (paths: string[]) => {
        removedAvatars.push(paths);
        return { error: null };
      })
    }))
  };

  return {
    client: { from, rpc, storage, auth: { admin: { updateUserById } } },
    recorded,
    removedAvatars,
    updateUserById
  };
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
    expect(admin.recorded.rpcCalls).toEqual([]);
    expect(admin.recorded.updates).toEqual([]);
    expect(server.signOut).not.toHaveBeenCalled();
  });

  it("破壊的な処理の前に deletion_state=pending と app_metadata の印を立てる", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    const pendingUpdate = admin.recorded.updates.find(({ table }) => table === "profiles");
    expect(pendingUpdate?.values).toMatchObject({ deletion_state: "pending", deleted_at: expect.any(String) });
    expect(markAccountWithdrawn).toHaveBeenCalledWith(userId, pendingUpdate?.values.deleted_at);
  });

  it("個人データの物理削除・匿名化は finalize_account_withdrawal RPC に委ねる", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: `${userId}/avatar.png` });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    expect(admin.recorded.rpcCalls).toContainEqual({
      name: "finalize_account_withdrawal",
      args: { target_user_id: userId }
    });
    // 個々のテーブルを TS から delete することはもう無い
    expect(admin.recorded.deletes).toEqual([]);
    // アバターの storage 削除は RPC の外
    expect(admin.removedAvatars).toEqual([[`${userId}/avatar.png`]]);
  });

  it("RPC が失敗したら pending のままエラーを返し、signOut しない", async () => {
    const admin = createAdminMock({ rpcError: new Error("boom") });
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);

    const result = await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    expect(result.status).toBe("error");
    expect(server.signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("app_metadata の印には profiles と同じ退会日時を使い、user_metadata には退会印を書かない", async () => {
    const admin = createAdminMock();
    const server = createServerMock({ nickname: "あかり", avatar_path: null });
    createSupabaseAdminClient.mockReturnValue(admin.client);
    createSupabaseServerClient.mockResolvedValue(server.client);
    getCurrentUser.mockResolvedValue({ id: userId, user_metadata: { locale: "ja" } });

    await withdrawAccountAction({ status: "idle" }, confirmationFormData("あかり"));

    expect(admin.updateUserById).toHaveBeenCalledWith(userId, {
      user_metadata: { locale: "ja", nickname: WITHDRAWN_DISPLAY_NAME }
    });
    expect(admin.updateUserById.mock.calls[0][1].user_metadata).not.toHaveProperty("withdrawn_at");
    expect(server.signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login?withdrawn=1");
  });
});
