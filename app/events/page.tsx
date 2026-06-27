import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { categoryLabels, eventStatusLabels } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="予定一覧" />
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
        <PageHeader title="予定一覧" />
        <LoginPanel />
      </div>
    );
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, title, category, start_date, end_date, location_name, status, plans(id)")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader title="予定一覧" description="日程調整の元になる予定を管理します。" action={<ButtonLink href="/events/new">予定作成</ButtonLink>} />
      {(events ?? []).length > 0 ? (
        <div className="grid gap-4">
          {(events ?? []).map((event) => (
            <a key={event.id} href={`/events/${event.id}`} className="block">
              <Card className="transition-colors hover:border-moss/45">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-3 inline-flex rounded-full bg-skywash/70 px-3 py-1 text-xs font-bold text-pine">
                      {categoryLabels[event.category as keyof typeof categoryLabels]}
                    </div>
                    <h2 className="text-xl font-bold text-ink">{event.title}</h2>
                    <p className="mt-2 text-sm text-ink/60">
                      {event.location_name ?? "場所メモ未設定"}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {formatDate(event.start_date)} - {formatDate(event.end_date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-ink/70">
                    <span className="rounded-full bg-mist px-3 py-1">{eventStatusLabels[event.status as keyof typeof eventStatusLabels]}</span>
                    <span className="rounded-full bg-white/80 px-3 py-1">予定 {event.plans?.length ?? 0}件</span>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      ) : (
        <EmptyState>まだ予定がありません。まずは「予定作成」から日程調整の箱を作ります。</EmptyState>
      )}
    </div>
  );
}
