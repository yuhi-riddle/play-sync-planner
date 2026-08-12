"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/safe-next-path";
import { errorState } from "@/lib/domain/shared/action-state";
import {
  PROFILE_AVATAR_BUCKET,
  getAvatarExtension,
  isProfileSchemaUnavailable,
  isProfileStorageUnavailable,
  profileInputSchema,
  validateAvatarFile,
  type ProfileActionState
} from "@/lib/domain/account/profile";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const PROFILE_MIGRATION_MESSAGE =
  "プロフィール機能の準備がまだ完了していません。管理者がmigration 019を適用してください。";

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = profileInputSchema.safeParse({
    nickname: formData.get("nickname"),
    removeAvatar: formData.get("removeAvatar")
  });
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "プロフィールの入力内容を確認してください。");
  }

  const avatarValue = formData.get("avatar");
  const avatar = avatarValue instanceof File && avatarValue.size > 0 ? avatarValue : null;
  if (avatar) {
    const avatarError = validateAvatarFile(avatar);
    if (avatarError) return errorState(avatarError);
  }

  const supabase = await createSupabaseServerClient();
  const { data: currentProfile, error: profileError } = await supabase
    .from("profiles")
    .select("avatar_path, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return errorState(isProfileSchemaUnavailable(profileError) ? PROFILE_MIGRATION_MESSAGE : "プロフィールを読み込めませんでした。");
  }

  let uploadedPath: string | null = null;
  let avatarPath = currentProfile?.avatar_path ?? null;

  if (avatar) {
    uploadedPath = `${user.id}/${crypto.randomUUID()}.${getAvatarExtension(avatar.type)}`;
    const { error: uploadError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(uploadedPath, avatar, {
      contentType: avatar.type,
      upsert: false
    });

    if (uploadError) {
      return errorState(
        isProfileStorageUnavailable(uploadError)
          ? PROFILE_MIGRATION_MESSAGE
          : "プロフィール画像を保存できませんでした。時間をおいてもう一度試してください。"
      );
    }

    avatarPath = uploadedPath;
  } else if (parsed.data.removeAvatar) {
    avatarPath = null;
  }

  const mode = formData.get("mode") === "onboarding" ? "onboarding" : "settings";
  const profileValues: Record<string, string | null> = {
    user_id: user.id,
    nickname: parsed.data.nickname,
    avatar_path: avatarPath
  };
  if (mode === "onboarding") {
    profileValues.onboarding_completed_at = new Date().toISOString();
  } else if (currentProfile?.onboarding_completed_at) {
    profileValues.onboarding_completed_at = currentProfile.onboarding_completed_at;
  }

  const { error: saveError } = await supabase.from("profiles").upsert(profileValues, { onConflict: "user_id" });
  if (saveError) {
    if (uploadedPath) {
      await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([uploadedPath]);
    }
    return errorState(isProfileSchemaUnavailable(saveError) ? PROFILE_MIGRATION_MESSAGE : "プロフィールを保存できませんでした。");
  }

  // Navigation and membership names can use auth metadata without extra profile queries.
  await supabase.auth.updateUser({
    data: {
      nickname: parsed.data.nickname,
      profile_onboarding_completed_at: profileValues.onboarding_completed_at ?? null
    }
  });

  /*
   * 参加中のイベントに残っている表示名も揃える。
   *
   * event_members.display_name は参加した時点のコピーなので、ここで書き換えないと
   * 古いイベントに前の名前が出続ける。退会処理（account.ts）は同じことをしていて、
   * 改名のときだけ通っていなかった。
   *
   * admin を使う理由: event_members の書き込みポリシーはイベントのオーナー限定
   * （015_fix_event_policy_recursion.sql）で、本人のクライアントでは自分の行も書けない。
   *
   * participants.display_name は触らない。清算の相手が分からなくなるのを避けるため
   * 残す設計で、プライバシーポリシーにもそう書いている。
   */
  const { error: memberNameError } = await createSupabaseAdminClient()
    .from("event_members")
    .update({ display_name: parsed.data.nickname })
    .eq("user_id", user.id);

  if (memberNameError) {
    // 表示名の追随は本筋ではない。保存そのものは成功しているので、失敗しても止めない。
    console.error("event_members の表示名を更新できませんでした", memberNameError);
  }

  const oldAvatarPath = currentProfile?.avatar_path ?? null;
  if (oldAvatarPath && oldAvatarPath !== avatarPath) {
    await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([oldAvatarPath]);
  }

  revalidatePath("/", "layout");

  if (mode === "onboarding") {
    redirect(safeNextPath(formData.get("next")?.toString()));
  }

  return { status: "success", message: "プロフィールを保存しました。" };
}
