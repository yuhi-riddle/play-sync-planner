import { redirect } from "next/navigation";

import { ProfileSettingsCard } from "@/components/profile-settings-card";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { Card, PageHeader } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import {
  getGoogleProfileDefaults,
  getProfileAvatarUrl,
  isProfileSchemaUnavailable
} from "@/lib/domain/profile";
import { createSupabaseServerClient, getCurrentUser, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfileOnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Welcome" title="プロフィール設定" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Welcome" title="プロフィール設定" />
        <LoginPanel />
      </div>
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("nickname, avatar_path, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect(nextPath);
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Welcome" title="プロフィール設定" />
        <Card className="max-w-2xl">
          <h2 className="text-title text-ink">プロフィール機能の準備が必要です</h2>
          <p className="mt-2 text-body text-muted">
            {isProfileSchemaUnavailable(error)
              ? "Supabaseへmigration 019を適用すると、プロフィール設定を続けられます。"
              : "プロフィールを読み込めませんでした。時間をおいてもう一度開いてください。"}
          </p>
        </Card>
      </div>
    );
  }

  const googleDefaults = getGoogleProfileDefaults(user);
  const currentAvatarUrl = getProfileAvatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    profile?.avatar_path,
    googleDefaults.avatarUrl
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Welcome"
        title="はじめにプロフィールを確認"
        description="Madoiで一緒に予定を立てる人へ表示する名前です。あとから設定で変更できます。"
      />
      <ProfileSettingsCard
        mode="onboarding"
        initialNickname={profile?.nickname ?? googleDefaults.nickname}
        currentAvatarUrl={currentAvatarUrl}
        hasCustomAvatar={Boolean(profile?.avatar_path)}
        nextPath={nextPath}
      />
    </div>
  );
}
