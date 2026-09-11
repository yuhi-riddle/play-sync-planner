import React from "react";
import { clsx } from "clsx";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, MapPin, UsersRound } from "lucide-react";

import { EventCancelAction } from "@/components/event/event-cancel-action";
import { EventListControls } from "@/components/event/event-list-controls";
import { EventWrapupActions } from "@/components/event/event-wrapup-actions";
import { Badge, type BadgeTone, Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/ui/state-panels";
import { cancelEventAction, completeEventAction, snoozeEventWrapupAction } from "@/lib/actions/event/events";
import { categoryAccent } from "@/lib/domain/event/category-color";
import { categoryLabels } from "@/lib/shared/constants";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import {
  buildEventListHref,
  eventDisplayStateLabels,
  eventMatchesSearch,
  getEventCardSummary,
  getEventLastScheduleTimestamp,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventCategoryFilter,
  type EventDisplayState,
  type EventListItem
} from "@/lib/domain/event/event-filter";
import { shouldShowWrapupPrompt } from "@/lib/domain/event/event-wrapup";
import { formatDate, formatDateTimeRangeWithWeekday, formatRelativeEventDate } from "@/lib/shared/format";
import { getEventListGroup, eventListGroupLabels, type EventListGroup } from "@/lib/domain/event/event-list-group";
import { createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const eventDisplayStateTones: Record<EventDisplayState, BadgeTone> = {
  participant_waiting: "neutral",
  schedule_creation_waiting: "info",
  answer_waiting: "info",
  event_waiting: "accent",
  settlement_waiting: "neutral",
  completed: "done",
  cancelled: "warn"
};

const EVENT_ROW_SELECT =
  "id, title, category, start_date, end_date, location_name, status, created_at, wrapup_snoozed_until, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day, answer_deadline_at)";

type EventFilterQuery = {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
  search?: string;
  display?: string;
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
  wrapup_snoozed_until: string | null;
  plans: Array<{
    id: string;
    status: string;
    settlement_status: string;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    is_all_day: boolean | null;
    answer_deadline_at: string | null;
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
  const isGrouped = query.status === "active";

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
  // フィルタ条件に関係なく、下書きがあれば常に一覧の先頭に出す
  const pinnedDraft = query.status !== "draft" ? eventDraft : null;

  const fetchEventRows = async (eventIds: string[]): Promise<EventRow[]> => {
    const { data: pageRows, error: pageError } = await supabase
      .from("events")
      .select(EVENT_ROW_SELECT)
      .in("id", eventIds);
    if (pageError) throw new Error(pageError.message);

    const rowsById = new Map(((pageRows ?? []) as EventRow[]).map((event) => [event.id, event]));
    return eventIds.flatMap((eventId) => {
      const event = rowsById.get(eventId);
      return event ? [event] : [];
    });
  };

  const fetchDoneOverflow = async (): Promise<{ events: EventRow[]; totalCount: number }> => {
    const [completedResult, cancelledResult] = await Promise.all([
      supabase.rpc("list_owned_event_ids", {
        p_filter: "completed",
        p_category: query.category,
        p_sort: "latest",
        p_limit: 5,
        p_offset: 0,
        p_query: query.search || null,
        p_display_state: "all"
      }),
      supabase.rpc("list_owned_event_ids", {
        p_filter: "cancelled",
        p_category: query.category,
        p_sort: "latest",
        p_limit: 5,
        p_offset: 0,
        p_query: query.search || null,
        p_display_state: "all"
      })
    ]);
    if (completedResult.error) throw new Error(completedResult.error.message);
    if (cancelledResult.error) throw new Error(cancelledResult.error.message);

    const completedRow = (completedResult.data?.[0] ?? null) as EventListRpcRow | null;
    const cancelledRow = (cancelledResult.data?.[0] ?? null) as EventListRpcRow | null;
    const totalCount = Number(completedRow?.total_count ?? 0) + Number(cancelledRow?.total_count ?? 0);
    const eventIds = [...(completedRow?.event_ids ?? []), ...(cancelledRow?.event_ids ?? [])];
    if (eventIds.length === 0) return { events: [], totalCount };

    const events = await fetchEventRows(eventIds);
    events.sort(
      (left, right) =>
        (getEventLastScheduleTimestamp(right) ?? 0) - (getEventLastScheduleTimestamp(left) ?? 0)
    );
    return { events: events.slice(0, 5), totalCount };
  };

  let eventRows: EventRow[] = [];
  let totalItems = visibleDraft ? 1 : 0;
  let doneOverflow: { events: EventRow[]; totalCount: number } = { events: [], totalCount: 0 };

  if (query.status !== "draft") {
    const requestedOffset = (query.page - 1) * query.pageSize;
    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_owned_event_ids", {
      p_filter: query.status,
      p_category: query.category,
      p_sort: query.sort,
      p_limit: query.pageSize,
      p_offset: requestedOffset,
      // 空文字ではなく null で渡す。SQL 側は null を「検索していない」として扱う
      p_query: query.search || null,
      p_display_state: query.displayState
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
      eventRows = await fetchEventRows(eventIds);
    }

    if (isGrouped) {
      doneOverflow = await fetchDoneOverflow();
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
        作成ボタンは常設FAB（MobileEventFab）がモバイル・デスクトップ両方で担うので、
        ヘッダー側には置かない。
      */}
      <PageHeader eyebrow="Events" title="イベント一覧" />
      <EventListControls query={displayQuery} draftCount={draftCount} pagination={pagination} />
      {visibleDraft ? (
        <DraftCard payload={draftPayload} category={draftCategory} />
      ) : (
        <div className="space-y-6">
          {pinnedDraft ? <DraftCard payload={draftPayload} category={draftCategory} /> : null}
          {isGrouped
            ? (() => {
                const buckets = bucketEventRows(eventRows);
                const doneAll = [...buckets.done, ...doneOverflow.events];
                return (
                  <>
                    {buckets.yourTurn.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.your_turn} count={buckets.yourTurn.length}>
                        {buckets.yourTurn.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="your_turn" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.waiting.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.waiting} count={buckets.waiting.length}>
                        {buckets.waiting.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="waiting" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.upcoming.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.upcoming} count={buckets.upcoming.length}>
                        {buckets.upcoming.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="upcoming" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {doneAll.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.done} count={doneAll.length} defaultOpen={false}>
                        {doneAll.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="done" />
                        ))}
                        {doneOverflow.totalCount > doneAll.length ? (
                          <Link
                            href="/events?status=completed"
                            className="text-center text-body font-bold text-pine underline-offset-2 hover:underline"
                          >
                            もっと見る
                          </Link>
                        ) : null}
                      </GroupSection>
                    ) : null}
                  </>
                );
              })()
            : eventRows.length > 0 ? (
              <div className="grid gap-4">
                {eventRows.map((event) => (
                  <EventCard key={event.id} event={event} showCancel={query.status === "active"} />
                ))}
              </div>
            ) : null}
          {eventRows.length === 0 && !pinnedDraft && (!isGrouped || doneOverflow.events.length === 0) ? (
            <EmptyState>
              {query.search
                ? `「${query.search}」に一致するイベントはありません。別の言葉で探すか、絞り込みを変えてみてください。`
                : "条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。"}
            </EmptyState>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DraftCard({ payload, category }: { payload: EventDraftPayload; category: EventCategoryFilter }) {
  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={getEventDraftResumePath()} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3">
              <Badge tone="info">下書き</Badge>
            </div>
            <h2 className="text-xl font-bold text-ink">
              {typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "タイトル未入力のイベント"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {typeof payload.location_name === "string" && payload.location_name.trim()
                ? payload.location_name.trim()
                : "場所メモ未設定"}
            </p>
          </div>
          <Badge tone="done">{category === "all" ? "カテゴリ未設定" : categoryLabels[category]}</Badge>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-pine">続きから入力</p>
      </Link>
    </Card>
  );
}

function EventCard({ event, showCancel }: { event: EventRow; showCancel: boolean }) {
  const summary = getEventCardSummary(event);
  const scheduleText = formatSchedule(summary.schedule);
  const locationText = event.location_name?.trim() || null;
  const normalizedCategory = normalizeCategory(event.category);
  const category = normalizedCategory === "all" ? "other" : normalizedCategory;
  const accent = categoryAccent(category);

  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={eventDisplayStateTones[summary.displayState]}>{eventDisplayStateLabels[summary.displayState]}</Badge>
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-caption font-bold",
              accent.badgeBg,
              accent.badgeText
            )}
          >
            <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
            {categoryLabels[category]}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink">{event.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {scheduleText ? <Meta icon={CalendarDays} text={scheduleText} strong={summary.schedule.isConfirmed} /> : null}
          {locationText ? <Meta icon={MapPin} text={locationText} /> : null}
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
        </div>
      </Link>
      {shouldShowWrapupPrompt(event) ? (
        <EventWrapupActions
          completeAction={completeEventAction.bind(null, event.id)}
          snoozeAction={snoozeEventWrapupAction.bind(null, event.id)}
        />
      ) : null}
      {showCancel && !isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}

const groupActionLabels: Partial<Record<EventDisplayState, string>> = {
  schedule_creation_waiting: "＋ 日程の候補をつくる",
  participant_waiting: "▶ 日程調整を始める",
  settlement_waiting: "¥ 清算をまとめる"
};

function groupedCardActionLine(
  event: EventRow,
  group: EventListGroup,
  summary: ReturnType<typeof getEventCardSummary>,
  isWrapup: boolean
): string {
  if (isWrapup) {
    return "✓ 完了か確認する";
  }
  if (group === "your_turn") {
    if (summary.displayState === "answer_waiting") {
      return "✎ 回答を締めて日程を確定する";
    }
    return groupActionLabels[summary.displayState] ?? "";
  }
  if (group === "waiting") {
    return "回答受付中";
  }
  if (group === "upcoming") {
    return summary.schedule.startAt ? formatRelativeEventDate(summary.schedule.startAt, new Date()) : "";
  }
  if (event.status === "cancelled") {
    return "中止";
  }
  return summary.schedule.startAt ? formatDate(summary.schedule.startAt) : "開催日未設定";
}

function GroupedEventCard({ event, group }: { event: EventRow; group: EventListGroup }) {
  const summary = getEventCardSummary(event);
  const normalizedCategory = normalizeCategory(event.category);
  const category = normalizedCategory === "all" ? "other" : normalizedCategory;
  const accent = categoryAccent(category);
  const isWrapup = shouldShowWrapupPrompt(event);
  const line = groupedCardActionLine(event, group, summary, isWrapup);

  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={clsx("mt-2 h-2 w-2 shrink-0 rounded-full", accent.dot)} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-ink">{event.title}</h2>
            {line ? <p className="mt-1 text-sm text-muted">{line}</p> : null}
          </div>
          <ChevronRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted" />
        </div>
      </Link>
      {isWrapup ? (
        <EventWrapupActions
          completeAction={completeEventAction.bind(null, event.id)}
          snoozeAction={snoozeEventWrapupAction.bind(null, event.id)}
        />
      ) : null}
      {!isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}

function GroupSection({
  title,
  count,
  defaultOpen = true,
  children
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="rounded-card border border-line bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between p-4 text-eyebrow uppercase text-muted [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <span className="tabular-nums">{count}</span>
        </span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="grid gap-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

type EventGroupBuckets = { yourTurn: EventRow[]; waiting: EventRow[]; upcoming: EventRow[]; done: EventRow[] };

function bucketEventRows(rows: EventRow[]): EventGroupBuckets {
  const buckets: EventGroupBuckets = { yourTurn: [], waiting: [], upcoming: [], done: [] };
  for (const event of rows) {
    const group = getEventListGroup(event);
    if (group === "your_turn") buckets.yourTurn.push(event);
    else if (group === "waiting") buckets.waiting.push(event);
    else if (group === "upcoming") buckets.upcoming.push(event);
    else buckets.done.push(event);
  }
  return buckets;
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
    return `確定 ${formatDateTimeRangeWithWeekday(schedule.startAt, schedule.endAt, schedule.isAllDay)}`;
  }
  return !schedule.endAt || schedule.startAt === schedule.endAt
    ? formatDate(schedule.startAt)
    : `${formatDate(schedule.startAt)} - ${formatDate(schedule.endAt)}`;
}
