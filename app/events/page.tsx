import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, CalendarDays, MapPin, ReceiptText, UsersRound } from "lucide-react";

import { EventCancelAction } from "@/components/event-cancel-action";
import { EventListControls } from "@/components/event-list-controls";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { cancelEventAction } from "@/lib/actions/events";
import { categoryLabels, eventStatusLabels } from "@/lib/constants";
import { getEventDraftResumePath } from "@/lib/domain/event-flow";
import {
  buildEventListHref,
  filterAndSortEventsForList,
  getEventCardSummary,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventListItem
} from "@/lib/event-filter";
import { formatDate, formatDateTimeRange } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventFilterQuery = {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
};

type EventRow = EventListItem & {
  id: string;
  title: string;
  category: string;
  start_date: string | null;
  end_date: string | null;
  location_name: string | null;
  status: string;
  created_at: string;
  plans: Array<{
    id: string;
    status: string;
    settlement_status: string;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    is_all_day: boolean | null;
  }> | null;
  event_members: Array<{ status: string }> | null;
};

type EventDraftPayload = {
  title?: string;
  category?: string;
  location_name?: string;
};

const settlementLabels = {
  not_started: "清算前",
  not_needed: "清算なし",
  needed: "清算待ち",
  settling: "清算中",
  settled: "清算済み"
} as const;

const EVENT_QUERY_BATCH_SIZE = 500;

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
    const events: EventRow[] = [];

    for (let from = 0; ; from += EVENT_QUERY_BATCH_SIZE) {
      let eventsQuery = supabase
        .from("events")
        .select(
          "id, title, category, start_date, end_date, location_name, status, created_at, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
        )
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (query.category !== "all") {
        eventsQuery = eventsQuery.eq("category", query.category);
      }

      const { data: batch, error } = await eventsQuery.range(from, from + EVENT_QUERY_BATCH_SIZE - 1);
      if (error) throw new Error(error.message);

      const rows = (batch ?? []) as EventRow[];
      events.push(...rows);
      if (rows.length < EVENT_QUERY_BATCH_SIZE) break;
    }

    const filteredEvents = filterAndSortEventsForList(events, query.status, query.sort);
    totalItems = filteredEvents.length;
    const requestedPagination = getEventListPagination(totalItems, query.pageSize, query.page);
    eventRows = filteredEvents.slice(requestedPagination.rangeFrom, requestedPagination.rangeTo + 1);
  }

  const pagination = getEventListPagination(totalItems, query.pageSize, query.page);
  if (pagination.page !== query.page) {
    redirect(buildEventListHref(query, pagination.page));
  }
  const displayQuery = { ...query, page: pagination.page };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベント一覧" description="予定と残っている対応をまとめて確認します。" action={<ButtonLink href="/events/new">イベント作成</ButtonLink>} />
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
            <EventCard key={event.id} event={event} showCancel={query.status === "active"} />
          ))}
        </div>
      ) : (
        <EmptyState>条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。</EmptyState>
      )}
    </div>
  );
}

function EventCard({ event, showCancel }: { event: EventRow; showCancel: boolean }) {
  const summary = getEventCardSummary(event);
  const statusLabel = eventStatusLabels[event.status as keyof typeof eventStatusLabels] ?? "確認中";

  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-skywash/70 px-3 py-1 text-xs font-bold text-pine">
            {categoryLabels[event.category as keyof typeof categoryLabels]}
          </span>
          <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-muted">{statusLabel}</span>
        </div>
        <h2 className="text-xl font-bold text-ink">{event.title}</h2>
        <div className="mt-4 grid gap-x-6 gap-y-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
          <Meta icon={CalendarDays} text={formatSchedule(summary.schedule)} strong={summary.schedule.isConfirmed} />
          <Meta icon={MapPin} text={event.location_name?.trim() || "場所未設定"} />
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
          <Meta icon={CalendarClock} text={`日程調整 ${summary.coordinationCount}件`} />
          <Meta icon={ReceiptText} text={settlementLabels[summary.settlementState]} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm font-bold text-pine">
          <span>{summary.nextAction}</span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </div>
      </Link>
      {showCancel && !isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}

function Meta({ icon: Icon, text, strong = false }: { icon: typeof CalendarDays; text: string; strong?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${strong ? "font-bold text-pine" : ""}`}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-moss" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function formatSchedule(schedule: ReturnType<typeof getEventCardSummary>["schedule"]) {
  if (!schedule.startAt) return "日程未設定";
  if (schedule.isConfirmed) {
    return `確定 ${formatDateTimeRange(schedule.startAt, schedule.endAt, schedule.isAllDay)}`;
  }
  return !schedule.endAt || schedule.startAt === schedule.endAt
    ? formatDate(schedule.startAt)
    : `${formatDate(schedule.startAt)} - ${formatDate(schedule.endAt)}`;
}
