import Link from "next/link";

import { AccountEmailCard } from "@/components/account-email-card";
import { CalendarConnectionCard } from "@/components/calendar-connection-card";
import { ProfileSettingsCard } from "@/components/profile-settings-card";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { Card, PageHeader } from "@/components/ui";
import { getGoogleProfileDefaults, getProfileAvatarUrl, isProfileSchemaUnavailable } from "@/lib/domain/profile";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ calendar?: string }>;
}) {
  const query = (await searchParams) ?? {};

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="設定" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="設定" />
        <LoginPanel />
      </div>
    );
  }

  const [{ data: profile, error: profileError }, { data: calendarIntegration }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nickname, avatar_path, onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("calendar_integrations")
      .select("account_email, updated_at")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle()
  ]);
  const googleDefaults = getGoogleProfileDefaults(user);
  const avatarUrl = getProfileAvatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    profile?.avatar_path,
    googleDefaults.avatarUrl
  );

  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="アカウント情報と外部サービス連携を管理できます。" />
      {profileError ? (
        <Card>
          <h2 className="text-title text-ink">プロフィール機能の準備が必要です</h2>
          <p className="mt-2 text-body text-muted">
            {isProfileSchemaUnavailable(profileError)
              ? "Supabaseへmigration 019を適用すると、プロフィールを変更できます。"
              : "プロフィールを読み込めませんでした。時間をおいてもう一度開いてください。"}
          </p>
        </Card>
      ) : (
        <ProfileSettingsCard
          mode="settings"
          initialNickname={profile?.nickname ?? googleDefaults.nickname}
          currentAvatarUrl={avatarUrl}
          hasCustomAvatar={Boolean(profile?.avatar_path)}
        />
      )}
      <AccountEmailCard email={user.email} />
      <CalendarConnectionCard
        connected={Boolean(calendarIntegration)}
        accountEmail={calendarIntegration?.account_email ?? null}
        updatedAt={calendarIntegration?.updated_at ?? null}
        status={query.calendar}
      />
      <Card className="max-w-2xl">
        <h2 className="text-title text-ink">退会</h2>
        <p className="mt-1 text-caption text-muted">
          Madoiの利用をやめる場合は、退会の手続きに進めます。退会すると元に戻せません。
        </p>
        <Link
          href="/settings/withdraw"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          退会の手続きへ
        </Link>
      </Card>
    </div>
  );
}
