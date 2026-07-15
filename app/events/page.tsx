import Link from "next/link";
import { redirect } from "next/navigation";

import { EventCancelAction } from "@/components/event-cancel-action";
import { EventListControls } from "@/components/event-list-controls";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { cancelEventAction } from "@/lib/actions/events";
import { categoryLabels, eventStatusLabels } from "@/lib/constants";
import { getEventDraftResumePath } from "@/lib/domain/event-flow";
import {
  buildEventListHref,
  getEventListPagination,
  getEventListSort,
  getEventStatusesForListFilter,
  normalizeCategory,
  normalizeEventListQuery
} from "@/lib/event-filter";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventFilterQuery = {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
};

type EventRow = {
  id: string;
  title: string;
  category: string;
  start_date: string | null;
  end_date: string | null;
  location_name: string | null;
  status: string;
  plans: Array<{ id: string }> | null;
};

type EventDraftPayload = {
  title?: string;
  category?: string;
  location_name?: string;
};

function getEventStatusLabel(event: EventRow) {
  if (event.status === "cancelled" || event.status === "done" || event.status === "skipped") {
    return eventStatusLabels[event.status];
  }

  return event.status === "confirmed" ? "確定" : event.plans?.length ? "日程調整中" : "参加者募集中";
}

export default async function EventsPage({ searchParams }: { searchParams?: Promise<EventFilterQuery> }) {
  const query = normalizeEventListQuery((await searchParams) ?? {});

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

  const { data: eventDraft } = await supabase
    .from("event_drafts")
    .select("id, payload, updated_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  const draftCount = eventDraft ? 1 : 0;
  const draftPayload = (eventDraft?.payload ?? {}) as EventDraftPayload;
  const draftCategory = normalizeCategory(draftPayload.category);
  const visibleDraft =
    query.status === "draft" &&
    eventDraft &&
    (query.category === "all" || query.category === draftCategory)
      ? eventDraft
      : null;

  let eventRows: EventRow[] = [];
  let totalItems = visibleDraft ? 1 : 0;

  if (query.status !== "draft") {
    const sort = getEventListSort(query.sort);
    let eventsQuery = supabase
      .from("events")
      .select("id, title, category, start_date, end_date, location_name, status, plans(id)", { count: "exact" })
      .eq("owner_user_id", user.id)
      .in("status", [...getEventStatusesForListFilter(query.status)]);

    if (query.category !== "all") {
      eventsQuery = eventsQuery.eq("category", query.category);
    }

    eventsQuery = eventsQuery.order(sort.column, {
      ascending: sort.ascending,
      ...(sort.column === "start_date" ? { nullsFirst: sort.nullsFirst } : {})
    });

    const rangeFrom = (query.page - 1) * query.pageSize;
    const { data: events, count } = await eventsQuery.range(rangeFrom, rangeFrom + query.pageSize - 1);
    eventRows = (events ?? []) as EventRow[];
    totalItems = count ?? eventRows.length;
  }

  const pagination = getEventListPagination(totalItems, query.pageSize, query.page);
  if (pagination.page !== query.page) {
    redirect(buildEventListHref(query, pagination.page));
  }
  const displayQuery = { ...query, page: pagination.page };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベント一覧" description="日程調整の元になるイベントを管理します。" action={<ButtonLink href="/events/new">イベント作成</ButtonLink>} />
      <EventListControls query={displayQuery} draftCount={draftCount} pagination={pagination} />
      {visibleDraft ? (
        <Card className="transition-colors hover:border-moss/45">
          <Link href={getEventDraftResumePath()} className="block focus:outline-none focus:ring-2 focus:ring-clay">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-3 inline-flex rounded-full border border-honey/45 bg-honey/18 px-3 py-1 text-xs font-bold text-honey-ink">
                  下書き
                </div>
                <h2 className="text-xl font-bold text-ink">
                  {typeof draftPayload.title === "string" && draftPayload.title.trim()
                    ? draftPayload.title.trim()
                    : "タイトル未入力のイベント"}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {typeof draftPayload.location_name === "string" && draftPayload.location_name.trim()
                    ? draftPayload.location_name.trim()
                    : "場所メモ未設定"}
                </p>
              </div>
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
                {draftCategory === "all" ? "カテゴリ未設定" : categoryLabels[draftCategory]}
              </span>
            </div>
            <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-pine">続きから入力</p>
          </Link>
        </Card>
      ) : eventRows.length > 0 ? (
        <div className="grid gap-4">
          {eventRows.map((event) => (
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
                    <span className="rounded-full bg-mist px-3 py-1">{getEventStatusLabel(event)}</span>
                    <span className="rounded-full bg-surface px-3 py-1">日程調整 {event.plans?.length ?? 0}件</span>
                  </div>
                </div>
              </Link>
              {query.status === "active" ? (
                <div className="mt-4 border-t border-line pt-4">
                  <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。</EmptyState>
      )}
    </div>
  );
}
