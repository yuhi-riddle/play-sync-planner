import { CalendarConnectionCard } from "@/components/calendar-connection-card";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { PageHeader } from "@/components/ui";
import { CALENDAR_EVENTS_SCOPE } from "@/lib/google-calendar/oauth";
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
    .select("account_email, updated_at, scope")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  const canWriteCalendarEvents = calendarIntegration?.scope?.split(" ").includes(CALENDAR_EVENTS_SCOPE) ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="アカウント情報と外部サービス連携を管理できます。" />
      <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="text-sm text-ink/60">メールアドレス</p>
        <p className="mt-1 font-semibold text-ink">{user.email}</p>
      </div>
      <CalendarConnectionCard
        connected={Boolean(calendarIntegration)}
        accountEmail={calendarIntegration?.account_email ?? null}
        updatedAt={calendarIntegration?.updated_at ?? null}
        canWriteEvents={canWriteCalendarEvents}
        status={query.calendar}
      />
    </div>
  );
}
