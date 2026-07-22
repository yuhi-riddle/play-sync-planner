"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RateLimitError, rateLimitErrorFromDatabase } from "@/lib/server/rate-limit";
import {
  RequestGuardError,
  requireEventAccess,
  requireUser,
  requireUuid
} from "@/lib/server/request-guards";

const sharedEventRequiredErrorCode = "PSP01";

type ConnectionTarget = {
  currentUserId: string;
  targetUserId: string;
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
};

async function requireAuthenticatedTarget(userId: string): Promise<ConnectionTarget> {
  const targetUserId = requireUuid(userId);
  let session: Awaited<ReturnType<typeof requireUser>>;
  try {
    session = await requireUser();
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }

  if (session.user.id === targetUserId) {
    throw new Error("自分自身にはこの操作を行えません。");
  }

  return {
    currentUserId: session.user.id,
    targetUserId,
    supabase: session.supabase
  };
}

async function requireConnectionTarget(userId: string): Promise<ConnectionTarget> {
  const target = await requireAuthenticatedTarget(userId);
  const [sharedEventResult, blockResult] = await Promise.all([
    target.supabase.rpc("have_shared_event", {
      first_user_id: target.currentUserId,
      second_user_id: target.targetUserId
    }),
    target.supabase.rpc("is_user_blocked", {
      first_user_id: target.currentUserId,
      second_user_id: target.targetUserId
    })
  ]);

  if (sharedEventResult.error || blockResult.error) {
    throw new Error("つながりの状態を確認できませんでした。");
  }
  if (!sharedEventResult.data) {
    throw new Error("共通のイベントに参加しているユーザーだけを操作できます。");
  }
  if (blockResult.data) {
    throw new Error("ブロック中のユーザーにはこの操作を行えません。");
  }

  return target;
}

function revalidateConnections(eventId?: string) {
  revalidatePath("/connections");
  if (eventId) revalidatePath(`/events/${eventId}`);
}

export async function followUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId, supabase } = await requireConnectionTarget(userId);
  const { error } = await supabase.from("user_connections").upsert(
    {
      follower_user_id: currentUserId,
      followed_user_id: targetUserId
    },
    { onConflict: "follower_user_id,followed_user_id" }
  );

  if (error) throw new Error("フォローできませんでした。");
  revalidateConnections();
}

export async function unfollowUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId, supabase } = await requireConnectionTarget(userId);
  const { error } = await supabase
    .from("user_connections")
    .delete()
    .eq("follower_user_id", currentUserId)
    .eq("followed_user_id", targetUserId);

  if (error) throw new Error("フォローを解除できませんでした。");
  revalidateConnections();
}

export async function toggleFavoriteAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId, supabase } = await requireConnectionTarget(userId);
  const [{ data: following, error: followingError }, { data: favorite, error: favoriteError }] =
    await Promise.all([
      supabase
        .from("user_connections")
        .select("follower_user_id")
        .eq("follower_user_id", currentUserId)
        .eq("followed_user_id", targetUserId)
        .maybeSingle(),
      supabase
        .from("user_favorites")
        .select("user_id")
        .eq("user_id", currentUserId)
        .eq("favorite_user_id", targetUserId)
        .maybeSingle()
    ]);

  if (followingError || favoriteError) {
    throw new Error("お気に入りの状態を確認できませんでした。");
  }
  if (!favorite && !following) {
    throw new Error("フォローしている人だけをお気に入りに追加できます。");
  }

  const { error } = favorite
    ? await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", currentUserId)
        .eq("favorite_user_id", targetUserId)
    : await supabase.from("user_favorites").insert({
        user_id: currentUserId,
        favorite_user_id: targetUserId
      });

  if (error) throw new Error("お気に入りを更新できませんでした。");
  revalidateConnections();
}

export async function blockUserAction(userId: string): Promise<void> {
  const { targetUserId, supabase } = await requireAuthenticatedTarget(userId);
  const { error } = await supabase.rpc("block_user_atomic", {
    target_user_id: targetUserId
  });

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (error?.code === sharedEventRequiredErrorCode) {
    throw new Error("共通のイベントに参加しているユーザーだけを操作できます。");
  }
  if (error) throw new Error("ブロックできませんでした。");
  revalidateConnections();
}

export async function unblockUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId, supabase } = await requireAuthenticatedTarget(userId);
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", currentUserId)
    .eq("blocked_user_id", targetUserId);

  if (error) throw new Error("ブロックを解除できませんでした。");
  revalidateConnections();
}

export async function createEventUserInvitationsAction(
  eventId: string,
  inviteeUserIds: string[]
): Promise<void> {
  let access: Awaited<ReturnType<typeof requireEventAccess>>;
  try {
    access = await requireEventAccess(eventId, "owner");
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) redirect("/login");
    throw error;
  }

  const targetUserIds = [...new Set(inviteeUserIds.map(requireUuid))];
  if (targetUserIds.length === 0 || targetUserIds.length > 20) {
    throw new Error("招待する人を1〜20人で選んでください。");
  }
  if (targetUserIds.includes(access.user.id)) {
    throw new Error("自分自身は招待できません。");
  }

  const { data: createdCount, error } = await access.supabase.rpc("create_event_user_invitations", {
    p_event_id: eventId,
    p_invitee_user_ids: targetUserIds
  });

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (createdCount === -429) throw new RateLimitError(60);
  if (createdCount === -409) {
    throw new Error("参加済み、または招待済みの人が含まれています。");
  }
  if (createdCount === -403) {
    throw new Error("招待できない人が含まれています。");
  }
  if (createdCount === -400) {
    throw new Error("招待する人を1〜20人で選んでください。");
  }
  if (error?.code === "23505") {
    throw new Error("参加済み、または招待済みの人が含まれています。");
  }
  if (error?.code === "42501") {
    throw new Error("招待できない人が含まれています。");
  }
  if (error) throw new Error("招待を作成できませんでした。");

  revalidateConnections(eventId);
  revalidatePath("/notifications");
}

export async function respondToEventUserInvitationAction(
  invitationId: string,
  response: "accepted" | "declined"
): Promise<void> {
  if (response !== "accepted" && response !== "declined") {
    throw new Error("招待への返答が正しくありません。");
  }

  const validatedInvitationId = requireUuid(invitationId);
  let session: Awaited<ReturnType<typeof requireUser>>;
  try {
    session = await requireUser();
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) redirect("/login");
    throw error;
  }

  const { data: eventId, error } = await session.supabase.rpc("respond_event_user_invitation", {
    p_invitation_id: validatedInvitationId,
    p_response: response
  });

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (eventId === "00000000-0000-0000-0000-000000000429") {
    throw new RateLimitError(60);
  }
  if (eventId === "00000000-0000-0000-0000-000000000403") {
    throw new Error("この招待には返答できません。");
  }
  if (eventId === "00000000-0000-0000-0000-000000000409") {
    throw new Error("この招待にはすでに返答しています。");
  }
  if (eventId === "00000000-0000-0000-0000-000000000400") {
    throw new Error("招待への返答が正しくありません。");
  }
  if (error?.code === "42501") throw new Error("この招待には返答できません。");
  if (error?.code === "55000") throw new Error("この招待にはすでに返答しています。");
  if (error || !eventId) throw new Error("招待への返答を保存できませんでした。");

  revalidateConnections(eventId);
  revalidatePath("/notifications");
}
