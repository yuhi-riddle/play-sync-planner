"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { errorState, successState, type ActionState } from "@/lib/domain/shared/action-state";
import {
  mapConnectionPage,
  type ConnectionCategory,
  type ConnectionCursor,
  type ConnectionPage
} from "@/lib/domain/account/connections";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sharedEventRequiredErrorCode = "PSP01";
const rateLimitExceededErrorCode = "PSP02";
const blockedRelationshipErrorCode = "PSP03";
const followRequiredErrorCode = "PSP04";

type ConnectionTarget = {
  currentUserId: string;
  targetUserId: string;
};

function requireTargetUserId(value: string): string {
  const userId = value.trim().toLowerCase();
  if (!userIdPattern.test(userId)) {
    throw new Error("ユーザーの指定が正しくありません");
  }

  return userId;
}

async function requireAuthenticatedTarget(userId: string): Promise<ConnectionTarget> {
  const targetUserId = requireTargetUserId(userId);
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.id === targetUserId) {
    throw new Error("自分自身にはこの操作を行えません");
  }

  return { currentUserId: user.id, targetUserId };
}

function revalidateConnections(eventId?: string) {
  revalidatePath("/connections");
  if (eventId) {
    revalidatePath(`/events/${eventId}`);
  }
}

export async function followUserAction(userId: string): Promise<ActionState> {
  try {
    const { targetUserId } = await requireAuthenticatedTarget(userId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("follow_user_atomic", { target_user_id: targetUserId });

    if (error) {
      if (error.code === sharedEventRequiredErrorCode) {
        return errorState("共通のイベントに参加しているユーザーだけを操作できます");
      }
      if (error.code === blockedRelationshipErrorCode) {
        return errorState("ブロック中のユーザーにはこの操作を行えません");
      }
      if (error.code === rateLimitExceededErrorCode) {
        return errorState("操作が多すぎます。しばらく待ってから再度お試しください。");
      }
      return errorState("フォローできませんでした");
    }

    revalidateConnections();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "フォローできませんでした");
  }
}

export async function unfollowUserAction(userId: string): Promise<ActionState> {
  try {
    const { targetUserId } = await requireAuthenticatedTarget(userId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("unfollow_user_atomic", { target_user_id: targetUserId });

    if (error) {
      if (error.code === sharedEventRequiredErrorCode) {
        return errorState("共通のイベントに参加しているユーザーだけを操作できます");
      }
      if (error.code === blockedRelationshipErrorCode) {
        return errorState("ブロック中のユーザーにはこの操作を行えません");
      }
      if (error.code === rateLimitExceededErrorCode) {
        return errorState("操作が多すぎます。しばらく待ってから再度お試しください。");
      }
      return errorState("フォローを解除できませんでした");
    }

    revalidateConnections();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "フォローを解除できませんでした");
  }
}

export async function toggleFavoriteAction(userId: string): Promise<ActionState> {
  try {
    const { targetUserId } = await requireAuthenticatedTarget(userId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("toggle_favorite_atomic", { target_user_id: targetUserId });

    if (error) {
      if (error.code === sharedEventRequiredErrorCode) {
        return errorState("共通のイベントに参加しているユーザーだけを操作できます");
      }
      if (error.code === blockedRelationshipErrorCode) {
        return errorState("ブロック中のユーザーにはこの操作を行えません");
      }
      if (error.code === followRequiredErrorCode) {
        return errorState("フォローしている人だけをお気に入りにできます");
      }
      if (error.code === rateLimitExceededErrorCode) {
        return errorState("操作が多すぎます。しばらく待ってから再度お試しください。");
      }
      return errorState("お気に入りを更新できませんでした");
    }

    revalidateConnections();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "お気に入りを更新できませんでした");
  }
}

export async function blockUserAction(userId: string): Promise<ActionState> {
  try {
    const { targetUserId } = await requireAuthenticatedTarget(userId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("block_user_atomic", {
      target_user_id: targetUserId
    });

    if (error) {
      if (error.code === sharedEventRequiredErrorCode) {
        return errorState("共通のイベントに参加しているユーザーだけを操作できます");
      }
      if (error.code === rateLimitExceededErrorCode) {
        return errorState("操作が多すぎます。しばらく待ってから再度お試しください。");
      }
      return errorState("ブロックできませんでした");
    }

    revalidateConnections();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "ブロックできませんでした");
  }
}

export async function unblockUserAction(userId: string): Promise<ActionState> {
  try {
    const { currentUserId, targetUserId } = await requireAuthenticatedTarget(userId);
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("user_blocks")
      .delete()
      .eq("blocker_user_id", currentUserId)
      .eq("blocked_user_id", targetUserId);

    if (error) {
      return errorState("ブロックを解除できませんでした");
    }

    revalidateConnections();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "ブロックを解除できませんでした");
  }
}

export async function loadMoreConnectionsAction(
  category: ConnectionCategory,
  cursor: ConnectionCursor
): Promise<ConnectionPage> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_connections", {
    p_category: category,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_user_id: cursor?.userId ?? null,
    p_limit: 20
  });

  if (error) {
    throw new Error("つながりを読み込めませんでした");
  }

  return mapConnectionPage(data ?? []);
}

export async function loadEventInviteCandidatesAction(
  eventId: string,
  cursor: ConnectionCursor
): Promise<ConnectionPage> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_event_invite_candidates", {
    p_event_id: eventId,
    p_query: null,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_user_id: cursor?.userId ?? null,
    p_limit: 20
  });

  if (error) {
    throw new Error("招待候補を読み込めませんでした");
  }

  return mapConnectionPage(data ?? []);
}

type CreateEventUserInvitationsResult =
  | { ok: true; created_count: number }
  | {
      ok: false;
      error:
        | "rate_limited"
        | "invalid_input"
        | "empty_selection"
        | "self_invite"
        | "not_owner"
        | "blocked"
        | "not_eligible"
        | "already_member"
        | "already_invited";
      retry_after_seconds?: number;
    };

const createInvitationsErrorMessages: Record<Exclude<CreateEventUserInvitationsResult, { ok: true }>["error"], string> = {
  rate_limited: "招待が多すぎます。しばらく待ってから再度お試しください。",
  invalid_input: "招待する人を選んでください。",
  empty_selection: "招待する人を選んでください。",
  self_invite: "自分自身は招待できません。",
  not_owner: "このイベントへ招待を送る権限がありません。",
  blocked: "ブロック中の人には招待を送れません。",
  not_eligible: "一緒に参加した人、フォロー中またはお気に入りの人だけを招待できます。",
  already_member: "すでに参加している人が含まれています。",
  already_invited: "保留中または承諾済みの招待がある人が含まれています。"
};

export async function createEventUserInvitationsAction(
  eventId: string,
  inviteeUserIds: string[]
): Promise<ActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      redirect("/login");
    }

    const targetUserIds = [...new Set(inviteeUserIds.map(requireTargetUserId))];
    if (targetUserIds.length === 0) {
      return errorState("招待する人を選んでください。");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_event_user_invitations", {
      p_event_id: eventId,
      p_invitee_user_ids: targetUserIds
    });

    if (error) {
      return errorState("招待を送れませんでした。");
    }

    const result = data as CreateEventUserInvitationsResult;
    if (!result.ok) {
      return errorState(createInvitationsErrorMessages[result.error]);
    }

    revalidateConnections(eventId);
    revalidatePath("/notifications");
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "招待を送れませんでした。");
  }
}

type RespondEventUserInvitationResult =
  | { ok: true; event_id: string }
  | {
      ok: false;
      error: "rate_limited" | "not_found" | "already_responded" | "blocked" | "not_shared_event";
      retry_after_seconds?: number;
    };

const respondInvitationErrorMessages: Record<Exclude<RespondEventUserInvitationResult, { ok: true }>["error"], string> = {
  rate_limited: "返答が多すぎます。しばらく待ってから再度お試しください。",
  not_found: "この招待には返答できません。",
  already_responded: "この招待にはすでに返答済みです。",
  blocked: "ブロック中の相手からの招待には返答できません。",
  not_shared_event: "招待の状態を確認できませんでした。"
};

export async function respondToEventUserInvitationAction(
  invitationId: string,
  response: "accepted" | "declined"
): Promise<ActionState> {
  if (response !== "accepted" && response !== "declined") {
    return errorState("招待への返答が正しくありません。");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("respond_event_user_invitation", {
      p_invitation_id: requireTargetUserId(invitationId),
      p_response: response
    });

    if (error) {
      return errorState("招待への返答を保存できませんでした。");
    }

    const result = data as RespondEventUserInvitationResult;
    if (!result.ok) {
      return errorState(respondInvitationErrorMessages[result.error]);
    }

    revalidateConnections(result.event_id);
    revalidatePath("/notifications");
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "招待への返答を保存できませんでした。");
  }
}
