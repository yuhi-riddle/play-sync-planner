"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const targetUserId = requireTargetUserId(userId);
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.id === targetUserId) {
    throw new Error("自分自身にはこの操作を行えません");
  }

  const admin = createSupabaseAdminClient();
  const [sharedEventResult, blockResult] = await Promise.all([
    admin.rpc("have_shared_event", { first_user_id: user.id, second_user_id: targetUserId }),
    admin.rpc("is_user_blocked", { first_user_id: user.id, second_user_id: targetUserId })
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
  const { data: favorite, error: favoriteError } = await supabase
    .from("user_favorites")
    .select("user_id")
    .eq("user_id", currentUserId)
    .eq("favorite_user_id", targetUserId)
    .maybeSingle();

  if (favoriteError) {
    throw new Error("お気に入りの状態を確認できませんでした");
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
