import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentActiveUser, revalidatePath, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT;${path}`);
  })
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("NEXT_REDIRECT")) throw cause;
  }
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentActiveUser }));

import {
  addConnectionGroupMembersAction,
  createConnectionGroupAction,
  deleteConnectionGroupAction,
  loadConnectionGroupCandidatesAction,
  removeConnectionGroupMemberAction,
  setPersonConnectionGroupsAction,
  updateConnectionGroupAction
} from "@/lib/actions/account/connection-groups";

const me = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const aya = "33333333-3333-4333-8333-333333333333";

function mockRpc(result: { data?: unknown; error: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error });
  createSupabaseServerClient.mockResolvedValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentActiveUser.mockResolvedValue({ id: me });
});

describe("createConnectionGroupAction", () => {
  it("名前を整えて RPC に渡し、作ったグループの ID を返す", async () => {
    const rpc = mockRpc({ data: groupId, error: null });

    const result = await createConnectionGroupAction({ name: " 謎解き仲間 ", color: "nazotoki", memberIds: [aya] });

    expect(result).toEqual({ status: "success", groupId });
    expect(rpc).toHaveBeenCalledWith("create_connection_group", {
      p_name: "謎解き仲間",
      p_color: "nazotoki",
      p_member_ids: [aya]
    });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("名前が空なら RPC を呼ばずに理由を返す", async () => {
    const rpc = mockRpc({ error: null });
    const result = await createConnectionGroupAction({ name: " ", color: "nazotoki" });
    expect(result).toEqual({ status: "error", message: "グループ名を入力してください" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("知らない色や UUID でないメンバーは RPC を呼ばずに弾く", async () => {
    const rpc = mockRpc({ error: null });
    expect((await createConnectionGroupAction({ name: "A", color: "black" })).status).toBe("error");
    expect((await createConnectionGroupAction({ name: "A", color: "nazotoki", memberIds: ["x"] })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PSP02", "操作が多すぎます。しばらく待ってから再度お試しください。"],
    ["PSP05", "グループは20個までです"],
    ["PSP06", "1つのグループに入れられるのは30人までです"],
    ["PSP07", "同じ名前のグループがあります"],
    ["PSP08", "一緒に参加したことがある人か、フォロー中の人だけを入れられます"]
  ])("%s を日本語の理由にする", async (code, message) => {
    mockRpc({ error: { code } });
    expect(await createConnectionGroupAction({ name: "A", color: "nazotoki" })).toEqual({ status: "error", message });
  });
});

describe("updateConnectionGroupAction", () => {
  it("名前と色を渡し、つながり画面とグループ画面を再検証する", async () => {
    const rpc = mockRpc({ error: null });
    const result = await updateConnectionGroupAction(groupId, { name: "謎解き部", color: "honey" });
    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("update_connection_group", { p_group_id: groupId, p_name: "謎解き部", p_color: "honey" });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
    expect(revalidatePath).toHaveBeenCalledWith(`/connections/groups/${groupId}`);
  });

  it("PSP09 は見つからない旨を返す", async () => {
    mockRpc({ error: { code: "PSP09" } });
    expect(await updateConnectionGroupAction(groupId, { name: "A", color: "nazotoki" })).toEqual({
      status: "error",
      message: "グループが見つかりません"
    });
  });
});

describe("deleteConnectionGroupAction", () => {
  it("消したらつながり画面へ戻す", async () => {
    const rpc = mockRpc({ error: null });
    await expect(deleteConnectionGroupAction(groupId)).rejects.toThrow("NEXT_REDIRECT;/connections");
    expect(rpc).toHaveBeenCalledWith("delete_connection_group", { p_group_id: groupId });
  });

  it("UUID でない ID は RPC を呼ばない", async () => {
    const rpc = mockRpc({ error: null });
    expect((await deleteConnectionGroupAction("x")).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("メンバー操作", () => {
  it("追加・削除・人ごとの設定がそれぞれの RPC を呼ぶ", async () => {
    const rpc = mockRpc({ error: null });
    await addConnectionGroupMembersAction(groupId, [aya]);
    await removeConnectionGroupMemberAction(groupId, aya);
    await setPersonConnectionGroupsAction(aya, [groupId]);
    expect(rpc).toHaveBeenNthCalledWith(1, "add_connection_group_members", { p_group_id: groupId, p_member_ids: [aya] });
    expect(rpc).toHaveBeenNthCalledWith(2, "remove_connection_group_member", { p_group_id: groupId, p_member_id: aya });
    expect(rpc).toHaveBeenNthCalledWith(3, "set_person_connection_groups", { p_member_id: aya, p_group_ids: [groupId] });
  });

  it("候補を読み込んで変換する", async () => {
    mockRpc({ data: [{ user_id: aya, display_name: "あや", shared_event_count: "2", is_following: false }], error: null });
    expect(await loadConnectionGroupCandidatesAction(groupId)).toEqual([
      { userId: aya, displayName: "あや", sharedEventCount: 2, isFollowing: false }
    ]);
  });

  it("ログインしていなければログイン画面へ", async () => {
    getCurrentActiveUser.mockResolvedValue(null);
    mockRpc({ error: null });
    await expect(addConnectionGroupMembersAction(groupId, [aya])).rejects.toThrow("NEXT_REDIRECT;/login");
  });
});
