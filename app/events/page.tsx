import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MapPin, UsersRound } from "lucide-react";

import { EventCancelAction } from "@/components/event/event-cancel-action";
import { EventListControls } from "@/components/event/event-list-controls";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/ui/state-panels";
import { cancelEventAction } from "@/lib/actions/event/events";
import { categoryLabels } from "@/lib/shared/constants";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import {
  buildEventListHref,
  eventDisplayStateLabels,
  eventMatchesSearch,
  getEventCardSummary,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventListItem
} from "@/lib/domain/event/event-filter";
import { formatDate, formatDateTimeRange } from "@/lib/shared/format";
import { createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventFilterQuery = {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
  search?: string;
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

type EventListRpcRow = {
  event_ids: string[] | null;
  total_count: number | string | null;
};

type EventDraftPayload = {
  title?: string;
  category?: string;
  location_name?: string;
};

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
  const userId = await getCurrentUserId();

  if (!userId) {
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
    .eq("owner_user_id", userId)
    .maybeSingle();
  const draftCount = eventDraft ? 1 : 0;
  const draftPayload = (eventDraft?.payload ?? {}) as EventDraftPayload;
  const draftCategory = normalizeCategory(draftPayload.category);
  const visibleDraft =
    query.status === "draft" &&
    eventDraft &&
    (query.category === "all" || query.category === draftCategory) &&
    // 下書きはサーバーに無くcookieの中なので、検索はここで自前でかける
    eventMatchesSearch({ title: draftPayload.title, location_name: draftPayload.location_name }, query.search)
      ? eventDraft
      : null;

  let eventRows: EventRow[] = [];
  let totalItems = visibleDraft ? 1 : 0;

  if (query.status !== "draft") {
    const requestedOffset = (query.page - 1) * query.pageSize;
    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_owned_event_ids", {
      p_filter: query.status,
      p_category: query.category,
      p_sort: query.sort,
      p_limit: query.pageSize,
      p_offset: requestedOffset,
      // 空文字ではなく null で渡す。SQL 側は null を「検索していない」として扱う
      p_query: query.search || null
    });
    if (rpcError) throw new Error(rpcError.message);

    const rpcRow = (rpcRows?.[0] ?? null) as EventListRpcRow | null;
    const eventIds = rpcRow?.event_ids ?? [];
    totalItems = Number(rpcRow?.total_count ?? 0);

    const requestedPagination = getEventListPagination(totalItems, query.pageSize, query.page);
    if (requestedPagination.page !== query.page) {
      redirect(buildEventListHref(query, requestedPagination.page));
    }

    if (eventIds.length > 0) {
      const { data: pageRows, error: pageError } = await supabase
        .from("events")
        .select(
          "id, title, category, start_date, end_date, location_name, status, created_at, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
        )
        .in("id", eventIds);
      if (pageError) throw new Error(pageError.message);

      const rowsById = new Map(((pageRows ?? []) as EventRow[]).map((event) => [event.id, event]));
      eventRows = eventIds.flatMap((eventId) => {
        const event = rowsById.get(eventId);
        return event ? [event] : [];
      });
    }
  }

  const pagination = getEventListPagination(totalItems, query.pageSize, query.page);
  if (pagination.page !== query.page) {
    redirect(buildEventListHref(query, pagination.page));
  }
  const displayQuery = { ...query, page: pagination.page };

  return (
    <div className="space-y-6">
      {/*
        説明文は外した。一覧を見れば分かることに、375px で1行使う価値がない。
        作成ボタンは、モバイルでは右下の FAB が同じ役割を持つので出さない
        （FAB は sm:hidden なので、ここを消すだけだと PC に作成導線が無くなる）。
      */}
      <PageHeader
        eyebrow="Events"
        title="イベント一覧"
        action={
          <div className="hidden sm:block">
            <ButtonLink href="/events/new">イベント作成</ButtonLink>
          </div>
        }
      />
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
        <EmptyState>
          {query.search
            ? `「${query.search}」に一致するイベントはありません。別の言葉で探すか、絞り込みを変えてみてください。`
            : "条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。"}
        </EmptyState>
      )}
    </div>
  );
}

function EventCard({ event, showCancel }: { event: EventRow; showCancel: boolean }) {
  const summary = getEventCardSummary(event);
  const scheduleText = formatSchedule(summary.schedule);
  const locationText = event.location_name?.trim() || null;

  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <span className="inline-flex rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
          {eventDisplayStateLabels[summary.displayState]}
        </span>
        <h2 className="mt-3 text-xl font-bold text-ink">{event.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {scheduleText ? <Meta icon={CalendarDays} text={scheduleText} strong={summary.schedule.isConfirmed} /> : null}
          {locationText ? <Meta icon={MapPin} text={locationText} /> : null}
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
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
  if (!schedule.startAt) return null;
  if (schedule.isConfirmed) {
    return `確定 ${formatDateTimeRange(schedule.startAt, schedule.endAt, schedule.isAllDay)}`;
  }
  return !schedule.endAt || schedule.startAt === schedule.endAt
    ? formatDate(schedule.startAt)
    : `${formatDate(schedule.startAt)} - ${formatDate(schedule.endAt)}`;
}
