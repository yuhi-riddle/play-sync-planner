import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient, getCurrentActiveUser, revalidatePath } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("NEXT_REDIRECT")) {
      throw cause;
    }
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentActiveUser
}));

import {
  blockUserAction,
  createEventUserInvitationsAction,
  followUserAction,
  respondToEventUserInvitationAction,
  toggleFavoriteAction,
  unblockUserAction,
  unfollowUserAction
} from "@/lib/actions/account/connections";

const currentUserId = "11111111-1111-4111-8111-111111111111";
const blockedUserId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const inviteeUserId = "44444444-4444-4444-8444-444444444444";
const invitationId = "55555555-5555-4555-8555-555555555555";

describe("followUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole follow operation to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await followUserAction(blockedUserId);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("follow_user_atomic", { target_user_id: blockedUserId });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("preserves the existing message when the target no longer shares an event", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PSP01", message: "A shared event is required" } })
    });

    const result = await followUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "共通のイベントに参加しているユーザーだけを操作できます" });
  });

  it("preserves the existing message when the relationship is blocked", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PSP03", message: "Blocked relationship" } })
    });

    const result = await followUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "ブロック中のユーザーにはこの操作を行えません" });
  });

  it("shows a rate limit message when the RPC reports PSP02", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PSP02", message: "Rate limit exceeded" } })
    });

    const result = await followUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "操作が多すぎます。しばらく待ってから再度お試しください。" });
  });

  it("uses the general follow error for an unexpected database failure", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "database failure" } })
    });

    const result = await followUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "フォローできませんでした" });
  });
});

describe("unfollowUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole unfollow operation to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await unfollowUserAction(blockedUserId);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("unfollow_user_atomic", { target_user_id: blockedUserId });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("uses the general unfollow error for an unexpected database failure", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "database failure" } })
    });

    const result = await unfollowUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "フォローを解除できませんでした" });
  });
});

describe("toggleFavoriteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole favorite toggle to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await toggleFavoriteAction(blockedUserId);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("toggle_favorite_atomic", { target_user_id: blockedUserId });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("preserves the existing message when the target isn't followed or favorited yet", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PSP04", message: "Must be following to favorite" } })
    });

    const result = await toggleFavoriteAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "フォローしている人だけをお気に入りにできます" });
  });

  it("uses the general favorite error for an unexpected database failure", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "database failure" } })
    });

    const result = await toggleFavoriteAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "お気に入りを更新できませんでした" });
  });
});

describe("blockUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole block operation to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await blockUserAction(blockedUserId);

    expect(result.status).toBe("success");
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

    const result = await blockUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "共通のイベントに参加しているユーザーだけを操作できます" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows a rate limit message when the RPC reports PSP02", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        error: { code: "PSP02", message: "Rate limit exceeded" }
      })
    });

    const result = await blockUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "操作が多すぎます。しばらく待ってから再度お試しください。" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("uses the general block error for an unexpected database failure", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "database failure" } })
    });

    const result = await blockUserAction(blockedUserId);

    expect(result).toEqual({ status: "error", message: "ブロックできませんでした" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("unblockUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
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

    const result = await unblockUserAction(blockedUserId);

    expect(result.status).toBe("success");
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("user_blocks");
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenNthCalledWith(1, "blocker_user_id", currentUserId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "blocked_user_id", blockedUserId);
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });
});

describe("createEventUserInvitationsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("returns early without calling the RPC when no invitees are given", async () => {
    const result = await createEventUserInvitationsAction(eventId, []);

    expect(result).toEqual({ status: "error", message: "招待する人を選んでください。" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("delegates to the atomic RPC with the deduplicated invitee list", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, created_count: 1 }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await createEventUserInvitationsAction(eventId, [inviteeUserId, inviteeUserId]);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("create_event_user_invitations", {
      p_event_id: eventId,
      p_invitee_user_ids: [inviteeUserId]
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
  });

  it.each([
    ["rate_limited", "招待が多すぎます。しばらく待ってから再度お試しください。"],
    ["self_invite", "自分自身は招待できません。"],
    ["not_owner", "このイベントへ招待を送る権限がありません。"],
    ["blocked", "ブロック中の人には招待を送れません。"],
    ["not_eligible", "一緒に参加した人、フォロー中またはお気に入りの人だけを招待できます。"],
    ["already_member", "すでに参加している人が含まれています。"],
    ["already_invited", "保留中または承諾済みの招待がある人が含まれています。"]
  ])("maps the %s RPC error to the existing message", async (error, message) => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: { ok: false, error }, error: null })
    });

    const result = await createEventUserInvitationsAction(eventId, [inviteeUserId]);

    expect(result).toEqual({ status: "error", message });
  });

  it("uses a generic message when the RPC call itself errors", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } })
    });

    const result = await createEventUserInvitationsAction(eventId, [inviteeUserId]);

    expect(result).toEqual({ status: "error", message: "招待を送れませんでした。" });
  });
});

describe("respondToEventUserInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: currentUserId });
  });

  it("rejects an invalid response value without calling the RPC", async () => {
    // @ts-expect-error intentionally invalid response for the runtime guard
    const result = await respondToEventUserInvitationAction(invitationId, "maybe");

    expect(result).toEqual({ status: "error", message: "招待への返答が正しくありません。" });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("delegates to the atomic RPC and revalidates using the returned event id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, event_id: eventId }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await respondToEventUserInvitationAction(invitationId, "accepted");

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("respond_event_user_invitation", {
      p_invitation_id: invitationId,
      p_response: "accepted"
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/events/${eventId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
  });

  it.each([
    ["not_found", "この招待には返答できません。"],
    ["already_responded", "この招待にはすでに返答済みです。"],
    ["blocked", "ブロック中の相手からの招待には返答できません。"],
    ["not_shared_event", "招待の状態を確認できませんでした。"]
  ])("maps the %s RPC error to the existing message", async (error, message) => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: { ok: false, error }, error: null })
    });

    const result = await respondToEventUserInvitationAction(invitationId, "declined");

    expect(result).toEqual({ status: "error", message });
  });
});
