import Link from "next/link";

import { EventCancelAction } from "@/components/event-cancel-action";
import { EventCategoryFilter } from "@/components/event-category-filter";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { cancelEventAction } from "@/lib/actions/events";
import { categoryLabels } from "@/lib/constants";
import { countEventsByCategory, normalizeCategory, resolveEventCategoryFilter } from "@/lib/event-filter";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventFilterQuery = {
  category?: string;
};

export default async function EventsPage({ searchParams }: { searchParams?: Promise<EventFilterQuery> }) {
  const query = (await searchParams) ?? {};
  const requestedCategory = normalizeCategory(query.category);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Events" title="イベント一覧" />
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
        <PageHeader eyebrow="Events" title="イベント一覧" />
        <LoginPanel />
      </div>
    );
  }

  const eventsQuery = supabase
    .from("events")
    .select("id, title, category, start_date, end_date, location_name, status, plans(id)")
    .eq("owner_user_id", user.id)
    .in("status", ["interested", "planning", "confirmed"])
    .order("created_at", { ascending: false });

  const { data: events } = await eventsQuery;
  const eventRows = events ?? [];
  const categoryCounts = countEventsByCategory(eventRows);
  const activeCategory = resolveEventCategoryFilter(requestedCategory, categoryCounts);
  const visibleEvents =
    activeCategory === "all" ? eventRows : eventRows.filter((event) => event.category === activeCategory);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベント一覧" description="日程調整の元になるイベントを管理します。" action={<ButtonLink href="/events/new">イベント作成</ButtonLink>} />
      <Card className="grid gap-4">
        <div>
          <h2 className="text-title text-ink">絞り込み</h2>
          <p className="mt-1 text-caption text-muted">カテゴリでイベントを探せます。</p>
        </div>
        <EventCategoryFilter activeCategory={activeCategory} categoryCounts={categoryCounts} />
      </Card>
      {visibleEvents.length > 0 ? (
        <div className="grid gap-4">
          {visibleEvents.map((event) => (
            <Card key={event.id} className="transition-colors hover:border-moss/45">
              <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="mb-3 inline-flex rounded-full bg-skywash/70 px-3 py-1 text-xs font-bold text-pine">
                      {categoryLabels[event.category as keyof typeof categoryLabels]}
                    </div>
                    <h2 className="text-xl font-bold text-ink">{event.title}</h2>
                    <p className="mt-2 text-sm text-muted">
                      {event.location_name ?? "場所メモ未設定"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(event.start_date)} - {formatDate(event.end_date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-muted">
                    <span className="rounded-full bg-mist px-3 py-1">{event.status === "confirmed" ? "確定" : event.plans?.length ? "日程調整中" : "参加者募集中"}</span>
                    <span className="rounded-full bg-surface px-3 py-1">日程調整 {event.plans?.length ?? 0}件</span>
                  </div>
                </div>
              </Link>
              <div className="mt-4 border-t border-line pt-4">
                <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。</EmptyState>
      )}
    </div>
  );
}
