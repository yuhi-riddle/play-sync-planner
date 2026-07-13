import Link from "next/link";
import type { ReactNode } from "react";

import { EventCancelAction } from "@/components/event-cancel-action";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { cancelEventAction } from "@/lib/actions/events";
import { categoryLabels, EVENT_CATEGORIES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventFilterQuery = {
  category?: string;
};

type EventCategoryFilter = "all" | (typeof EVENT_CATEGORIES)[number];

function normalizeCategory(value: string | undefined) {
  return EVENT_CATEGORIES.includes(value as (typeof EVENT_CATEGORIES)[number])
    ? (value as (typeof EVENT_CATEGORIES)[number])
    : "all";
}

function filterHref(category: EventCategoryFilter) {
  const params = new URLSearchParams();
  if (category !== "all") {
    params.set("category", category);
  }
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

function FilterChip({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          : "inline-flex min-h-11 items-center justify-center rounded-full border border-moss/16 bg-cream/82 px-4 py-2 text-sm font-bold text-ink/68 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      }
    >
      {children}
    </Link>
  );
}

export default async function EventsPage({ searchParams }: { searchParams?: Promise<EventFilterQuery> }) {
  const query = (await searchParams) ?? {};
  const activeCategory = normalizeCategory(query.category);

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="イベント一覧" />
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
        <PageHeader title="イベント一覧" />
        <LoginPanel />
      </div>
    );
  }

  let eventsQuery = supabase
    .from("events")
    .select("id, title, category, start_date, end_date, location_name, status, plans(id)")
    .eq("owner_user_id", user.id)
    .in("status", ["interested", "planning", "confirmed"])
    .order("created_at", { ascending: false });

  if (activeCategory !== "all") {
    eventsQuery = eventsQuery.eq("category", activeCategory);
  }

  const { data: events } = await eventsQuery;

  return (
    <div className="space-y-6">
      <PageHeader title="イベント一覧" description="日程調整の元になるイベントを管理します。" action={<ButtonLink href="/events/new">イベント作成</ButtonLink>} />
      <Card className="grid gap-4">
        <div>
          <h2 className="text-base font-bold text-ink">絞り込み</h2>
          <p className="mt-1 text-sm text-ink/58">カテゴリと状態でイベントを探せます。</p>
        </div>
        <div className="grid gap-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-moss">カテゴリ</p>
            <div className="flex flex-wrap gap-2">
              <FilterChip href={filterHref("all")} active={activeCategory === "all"}>
                すべて
              </FilterChip>
              {EVENT_CATEGORIES.map((category) => (
                <FilterChip
                  key={category}
                  href={filterHref(category)}
                  active={activeCategory === category}
                >
                  {categoryLabels[category]}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {(events ?? []).length > 0 ? (
        <div className="grid gap-4">
          {(events ?? []).map((event) => (
            <Card key={event.id} className="transition-colors hover:border-moss/45">
              <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
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
                    <span className="rounded-full bg-mist px-3 py-1">{event.status === "confirmed" ? "確定" : event.plans?.length ? "日程調整中" : "参加者募集中"}</span>
                    <span className="rounded-full bg-cream/82 px-3 py-1">日程調整 {event.plans?.length ?? 0}件</span>
                  </div>
                </div>
              </Link>
              <div className="mt-4 border-t border-ink/8 pt-4">
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
