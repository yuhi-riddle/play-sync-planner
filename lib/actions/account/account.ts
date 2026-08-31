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
  const withdrawnAt = new Date().toISOString();

  // 1. 退会開始の印を、破壊的な処理より先に立てる。
  //    deletion_state=pending は「処理中／途中で失敗したかもしれない」印（監視・再実行用）。
  //    退会ゲートの正本は app_metadata.withdrawn_at で、これも destructive step の前に書く。
  //    ここまでで失敗して return しても、データはまだ何も消えていない。
  const { error: markError } = await admin
    .from("profiles")
    .update({ deletion_state: "pending", deleted_at: withdrawnAt })
    .eq("user_id", user.id);

  if (markError) {
    return errorState("退会処理を開始できませんでした。時間をおいて再度お試しください。");
  }

  try {
    await markAccountWithdrawn(user.id, withdrawnAt);
  } catch {
    return errorState("退会処理を開始できませんでした。時間をおいて再度お試しください。");
  }

  // 2. 本人だけのデータの物理削除・匿名化を 1 トランザクションで（migration 045）。
  //    途中失敗しても deletion_state は pending のまま。もう一度退会すれば冪等に再実行される。
  const { error: finalizeError } = await admin.rpc("finalize_account_withdrawal", {
    target_user_id: user.id
  });

  if (finalizeError) {
    return errorState("退会処理の途中でエラーが発生しました。もう一度退会をお試しください。");
  }

  // participants.display_name は残す。清算の相手が誰か分からなくなるため。
  // 残ることはプライバシーポリシーに明記している。

  // 3. 外部（storage・Auth の user_metadata）。ここが失敗しても退会自体は成立している。
  if (profile?.avatar_path) {
    const { error: storageError } = await admin.storage
      .from(PROFILE_AVATAR_BUCKET)
      .remove([profile.avatar_path]);
    if (storageError) {
      console.error("退会時のアバター削除に失敗しました", storageError);
    }
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      nickname: WITHDRAWN_DISPLAY_NAME
    }
  });
  if (metadataError) {
    console.error("退会時の user_metadata 更新に失敗しました", metadataError);
  }

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login?withdrawn=1");
}
