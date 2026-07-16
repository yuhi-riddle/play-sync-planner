"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canInviteCandidate } from "@/lib/domain/connections";
import { getUserDisplayName } from "@/lib/domain/profile";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function requireConnectionTarget(userId: string, options: { allowBlocked?: boolean } = {}): Promise<ConnectionTarget> {
  const target = await requireAuthenticatedTarget(userId);
  const { currentUserId, targetUserId } = target;
  const admin = createSupabaseAdminClient();
  const [sharedEventResult, blockResult] = await Promise.all([
    admin.rpc("have_shared_event", { first_user_id: currentUserId, second_user_id: targetUserId }),
    admin.rpc("is_user_blocked", { first_user_id: currentUserId, second_user_id: targetUserId })
  ]);

  if (sharedEventResult.error || blockResult.error) {
    throw new Error("接続の状態を確認できませんでした");
  }

  if (!sharedEventResult.data) {
    throw new Error("共通のイベントに参加しているユーザーだけを操作できます");
  }

  if (blockResult.data && !options.allowBlocked) {
    throw new Error("ブロック中のユーザーにはこの操作を行えません");
  }

  return target;
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

export async function followUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId } = await requireConnectionTarget(userId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_connections").upsert(
    {
      follower_user_id: currentUserId,
      followed_user_id: targetUserId
    },
    { onConflict: "follower_user_id,followed_user_id" }
  );

  if (error) {
    throw new Error("フォローできませんでした");
  }

  revalidateConnections();
}

export async function unfollowUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId } = await requireConnectionTarget(userId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_connections")
    .delete()
    .eq("follower_user_id", currentUserId)
    .eq("followed_user_id", targetUserId);

  if (error) {
    throw new Error("フォローを解除できませんでした");
  }

  revalidateConnections();
}

export async function toggleFavoriteAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId } = await requireConnectionTarget(userId);
  const supabase = await createSupabaseServerClient();
  const [{ data: following, error: followingError }, { data: favorite, error: favoriteError }] = await Promise.all([
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
    throw new Error("お気に入りの状態を確認できませんでした");
  }

  if (!favorite && !following) {
    throw new Error("フォローしている人だけをお気に入りにできます");
  }

  const { error } = favorite
    ? await supabase.from("user_favorites").delete().eq("user_id", currentUserId).eq("favorite_user_id", targetUserId)
    : await supabase.from("user_favorites").insert({ user_id: currentUserId, favorite_user_id: targetUserId });

  if (error) {
    throw new Error(favorite ? "お気に入りを解除できませんでした" : "お気に入りに追加できませんでした");
  }

  revalidateConnections();
}

export async function blockUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId } = await requireConnectionTarget(userId, { allowBlocked: true });
  const admin = createSupabaseAdminClient();

  const [{ error: connectionsError }, { error: favoritesError }] = await Promise.all([
    admin
      .from("user_connections")
      .delete()
      .or(
        `and(follower_user_id.eq.${currentUserId},followed_user_id.eq.${targetUserId}),and(follower_user_id.eq.${targetUserId},followed_user_id.eq.${currentUserId})`
      ),
    admin
      .from("user_favorites")
      .delete()
      .or(
        `and(user_id.eq.${currentUserId},favorite_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},favorite_user_id.eq.${currentUserId})`
      )
  ]);

  if (connectionsError || favoritesError) {
    throw new Error("接続情報を削除できませんでした");
  }

  const { error: blockError } = await admin.from("user_blocks").upsert(
    {
      blocker_user_id: currentUserId,
      blocked_user_id: targetUserId
    },
    { onConflict: "blocker_user_id,blocked_user_id" }
  );

  if (blockError) {
    throw new Error("ブロックできませんでした");
  }

  revalidateConnections();
}

export async function unblockUserAction(userId: string): Promise<void> {
  const { currentUserId, targetUserId } = await requireAuthenticatedTarget(userId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("user_blocks")
    .delete()
    .eq("blocker_user_id", currentUserId)
    .eq("blocked_user_id", targetUserId);

  if (error) {
    throw new Error("ブロックを解除できませんでした");
  }

  revalidateConnections();
}

async function requireInvitationOwner(eventId: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdminClient();
  const { data: event, error } = await admin
    .from("events")
    .select("id, owner_user_id, title")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event || event.owner_user_id !== user.id) {
    throw new Error("このイベントへ招待を送る権限がありません。");
  }

  return { admin, event, user };
}

export async function createEventUserInvitationsAction(eventId: string, inviteeUserIds: string[]): Promise<void> {
  const { admin, event, user } = await requireInvitationOwner(eventId);
  const targetUserIds = [...new Set(inviteeUserIds.map(requireTargetUserId))];

  if (targetUserIds.length === 0) {
    throw new Error("招待する人を選んでください。");
  }

  if (targetUserIds.includes(user.id)) {
    throw new Error("自分自身は招待できません。");
  }

  const [
    { data: memberships, error: membershipError },
    { data: invitations, error: invitationError },
    { data: following, error: followingError },
    { data: favorites, error: favoritesError },
    ...relationshipChecks
  ] = await Promise.all([
    admin.from("event_members").select("user_id, status").eq("event_id", eventId).in("user_id", targetUserIds),
    admin
      .from("event_user_invitations")
      .select("invitee_user_id, status")
      .eq("event_id", eventId)
      .in("invitee_user_id", targetUserIds)
      .in("status", ["pending", "accepted"]),
    admin.from("user_connections").select("followed_user_id").eq("follower_user_id", user.id).in("followed_user_id", targetUserIds),
    admin.from("user_favorites").select("favorite_user_id").eq("user_id", user.id).in("favorite_user_id", targetUserIds),
    ...targetUserIds.flatMap((targetUserId) => [
      admin.rpc("have_shared_event", { first_user_id: user.id, second_user_id: targetUserId }),
      admin.rpc("is_user_blocked", { first_user_id: user.id, second_user_id: targetUserId })
    ])
  ]);

  if (membershipError || invitationError || followingError || favoritesError) {
    throw new Error("招待できる相手を確認できませんでした。");
  }

  const followingUserIds = new Set((following ?? []).map((connection) => connection.followed_user_id));
  const favoriteUserIds = new Set((favorites ?? []).map((favorite) => favorite.favorite_user_id));

  for (let index = 0; index < targetUserIds.length; index += 1) {
    const targetUserId = targetUserIds[index];
    const sharedEventResult = relationshipChecks[index * 2];
    const blockedResult = relationshipChecks[index * 2 + 1];

    if (sharedEventResult.error || blockedResult.error) {
      throw new Error("招待できる相手を確認できませんでした。");
    }

    if (blockedResult.data) {
      throw new Error("ブロック中の人には招待を送れません。");
    }

    if (
      !canInviteCandidate({
        hasSharedEvent: Boolean(sharedEventResult.data),
        isFollowing: followingUserIds.has(targetUserId),
        isFavorite: favoriteUserIds.has(targetUserId),
        isBlocked: false
      })
    ) {
      throw new Error("一緒に参加した人、フォロー中またはお気に入りの人だけを招待できます。");
    }
  }

  if ((memberships ?? []).some((membership) => membership.status === "joined")) {
    throw new Error("すでに参加している人が含まれています。");
  }

  if ((invitations ?? []).length > 0) {
    throw new Error("保留中または承諾済みの招待がある人が含まれています。");
  }

  for (const inviteeUserId of targetUserIds) {
    const { error: inviteError } = await admin.from("event_user_invitations").insert({
      event_id: eventId,
      inviter_user_id: user.id,
      invitee_user_id: inviteeUserId,
      status: "pending"
    });

    if (inviteError) {
      throw new Error("招待を作成できませんでした。");
    }

    const { error: notificationError } = await admin.from("notifications").upsert(
      {
        user_id: inviteeUserId,
        kind: "event_invitation",
        title: `${event.title} に招待されました`,
        body: "Madoiでイベントへの招待が届いています。",
        href: "/connections",
        dedupe_key: `event-invitation:${eventId}:${inviteeUserId}`,
        read_at: null
      },
      { onConflict: "user_id,dedupe_key" }
    );

    if (notificationError) {
      throw new Error("招待通知を作成できませんでした。");
    }
  }

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

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdminClient();
  const { data: invitation, error: invitationError } = await admin
    .from("event_user_invitations")
    .select("id, event_id, inviter_user_id, invitee_user_id, status, events(title)")
    .eq("id", requireTargetUserId(invitationId))
    .maybeSingle();

  if (invitationError || !invitation || invitation.invitee_user_id !== user.id) {
    throw new Error("この招待には返答できません。");
  }

  if (invitation.status !== "pending" && !(response === "accepted" && invitation.status === "accepted")) {
    throw new Error("この招待にはすでに返答済みです。");
  }

  const [sharedEventResult, blockedResult, membershipResult] = await Promise.all([
    admin.rpc("have_shared_event", { first_user_id: invitation.inviter_user_id, second_user_id: user.id }),
    admin.rpc("is_user_blocked", { first_user_id: invitation.inviter_user_id, second_user_id: user.id }),
    admin
      .from("event_members")
      .select("status")
      .eq("event_id", invitation.event_id)
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  if (sharedEventResult.error || blockedResult.error || membershipResult.error || !sharedEventResult.data) {
    throw new Error("招待の状態を確認できませんでした。");
  }

  if (blockedResult.data) {
    throw new Error("ブロック中の相手からの招待には返答できません。");
  }

  const { data: claimedInvitation, error: claimError } = await admin
    .from("event_user_invitations")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimError) {
    throw new Error("招待への返答を保存できませんでした。");
  }

  if (!claimedInvitation) {
    const { data: latestInvitation, error: latestInvitationError } = await admin
      .from("event_user_invitations")
      .select("status")
      .eq("id", invitation.id)
      .maybeSingle();

    if (latestInvitationError || latestInvitation?.status !== response) {
      throw new Error("この招待にはすでに返答済みです。");
    }

    if (response === "declined") {
      revalidateConnections(invitation.event_id);
      revalidatePath("/notifications");
      return;
    }
  }

  if (response === "accepted") {
    if (membershipResult.data?.status !== "joined") {
      const { error: memberError } = await admin.from("event_members").upsert(
        {
          event_id: invitation.event_id,
          user_id: user.id,
          display_name: getUserDisplayName(user),
          role: "member",
          status: "joined"
        },
        { onConflict: "event_id,user_id" }
      );

      if (memberError) {
        if (claimedInvitation) {
          const { error: rollbackError } = await admin
            .from("event_user_invitations")
            .update({ status: "pending", responded_at: null })
            .eq("id", invitation.id)
            .eq("status", "accepted");

          if (rollbackError) {
            await admin.from("event_user_invitations").delete().eq("id", invitation.id).eq("status", "accepted");
          }
        }

        throw new Error("イベントへの参加を確定できませんでした。");
      }
    }
  }

  revalidateConnections(invitation.event_id);
  revalidatePath("/notifications");
}
