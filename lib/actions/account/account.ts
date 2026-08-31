"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markAccountWithdrawn } from "@/lib/auth/withdrawal-mark";
import { errorState } from "@/lib/domain/shared/action-state";
import {
  WITHDRAWN_DISPLAY_NAME,
  isWithdrawalConfirmed,
  type AccountActionState
} from "@/lib/domain/account/account";
import { PROFILE_AVATAR_BUCKET, getUserDisplayName } from "@/lib/domain/account/profile";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv
} from "@/lib/supabase/server";

/**
 * 退会処理。
 *
 * auth.users は削除しない。events.owner_user_id が on delete cascade のため、
 * 消すと主催イベントと他の参加者の清算記録まで連鎖して消えてしまう。
 * 個人情報だけを物理削除し、記録に残る表示名を匿名化する。
 */
export async function withdrawAccountAction(
  _previousState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!hasSupabaseAdminEnv()) {
    return errorState("退会処理の準備ができていません。管理者にお問い合わせください。");
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();

  const nickname = profile?.nickname ?? getUserDisplayName(user, "");
  if (!isWithdrawalConfirmed(formData.get("confirmation")?.toString() ?? null, nickname)) {
    return errorState("退会するには、表示名をそのまま入力してください。");
  }

  const admin = createSupabaseAdminClient();

  // つながり・通知・下書き・外部連携は本人だけのデータなので物理削除する。
  // events / plans / expenses / settlements / participants / user_consents は残す。
  await Promise.all([
    admin.from("user_connections").delete().eq("follower_user_id", user.id),
    admin.from("user_connections").delete().eq("followed_user_id", user.id),
    admin.from("user_favorites").delete().eq("user_id", user.id),
    admin.from("user_favorites").delete().eq("favorite_user_id", user.id),
    admin.from("user_blocks").delete().eq("blocker_user_id", user.id),
    admin.from("user_blocks").delete().eq("blocked_user_id", user.id),
    admin.from("event_user_invitations").delete().eq("inviter_user_id", user.id),
    admin.from("event_user_invitations").delete().eq("invitee_user_id", user.id),
    admin.from("notifications").delete().eq("user_id", user.id),
    admin.from("event_drafts").delete().eq("owner_user_id", user.id),
    admin.from("calendar_integrations").delete().eq("user_id", user.id)
  ]);

  if (profile?.avatar_path) {
    await admin.storage.from(PROFILE_AVATAR_BUCKET).remove([profile.avatar_path]);
  }

  const withdrawnAt = new Date().toISOString();

  await admin
    .from("profiles")
    .update({ nickname: WITHDRAWN_DISPLAY_NAME, avatar_path: null, deleted_at: withdrawnAt })
    .eq("user_id", user.id);

  await markAccountWithdrawn(user.id, withdrawnAt);

  await admin.from("event_members").update({ display_name: WITHDRAWN_DISPLAY_NAME }).eq("user_id", user.id);

  // participants.display_name は残す。清算の相手が誰か分からなくなるため。
  // 残ることはプライバシーポリシーに明記している。

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      nickname: WITHDRAWN_DISPLAY_NAME
    }
  });

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login?withdrawn=1");
}
