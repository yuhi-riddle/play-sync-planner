import { AccountEmailCard } from "@/components/account-email-card";
import { CalendarConnectionCard } from "@/components/calendar-connection-card";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { PageHeader, SecondaryLink } from "@/components/ui";
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

  const { data: calendarIntegration } = await supabase
    .from("calendar_integrations")
    .select("account_email, updated_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="アカウント情報と外部サービス連携を管理できます。" />
      <AccountEmailCard email={user.email} />
      <section className="rounded-lg border border-white/80 bg-cream/88 p-5 shadow-soft">
        <h2 className="text-xl font-semibold text-ink">つながり</h2>
        <p className="mt-2 text-sm text-ink/65">一緒に参加した人のフォローやお気に入りを管理できます。</p>
        <div className="mt-4">
          <SecondaryLink href="/connections">つながりを開く</SecondaryLink>
        </div>
      </section>
      <CalendarConnectionCard
        connected={Boolean(calendarIntegration)}
        accountEmail={calendarIntegration?.account_email ?? null}
        updatedAt={calendarIntegration?.updated_at ?? null}
        status={query.calendar}
      />
    </div>
  );
}
