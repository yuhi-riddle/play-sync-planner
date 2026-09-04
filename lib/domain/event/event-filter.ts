import { EVENT_CATEGORIES } from "@/lib/shared/constants";

export const EVENT_LIST_FILTERS = ["active", "draft", "cancelled", "completed"] as const;
export const EVENT_LIST_SORTS = ["newest", "soonest", "latest"] as const;
export const EVENT_LIST_PAGE_SIZES = [10, 20, 50] as const;
export const EVENT_LIST_PROGRESS_STATES = [
  "participant_waiting",
  "schedule_creation_waiting",
  "answer_waiting",
  "event_waiting",
  "settlement_waiting"
] as const;

export type EventListFilter = (typeof EVENT_LIST_FILTERS)[number];
export type EventListSort = (typeof EVENT_LIST_SORTS)[number];
export type EventListPageSize = (typeof EVENT_LIST_PAGE_SIZES)[number];
export type EventListProgressState = (typeof EVENT_LIST_PROGRESS_STATES)[number] | "all";
export type EventSettlementState = "not_started" | "not_needed" | "needed" | "settling" | "settled";
export type EventDisplayState =
  | "participant_waiting"
  | "schedule_creation_waiting"
  | "answer_waiting"
  | "event_waiting"
  | "settlement_waiting"
  | "completed"
  | "cancelled";

export const eventDisplayStateLabels: Record<EventDisplayState, string> = {
  participant_waiting: "参加者待ち",
  schedule_creation_waiting: "日程作成待ち",
  answer_waiting: "回答待ち",
  event_waiting: "開催待ち",
  settlement_waiting: "清算待ち",
  completed: "完了",
  cancelled: "中止"
};

export type EventListPlan = {
  status?: string | null;
  settlement_status?: string | null;
  confirmed_start_at?: string | null;
  confirmed_end_at?: string | null;
  is_all_day?: boolean | null;
};

export type EventListItem = {
  status: string;
  created_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  plans?: readonly EventListPlan[] | null;
  event_members?: readonly { status?: string | null }[] | null;
};

export type EventScheduleSummary = {
  startAt: string | null;
  endAt: string | null;
  isAllDay: boolean;
  isConfirmed: boolean;
};

export type EventListQuery = {
  status: EventListFilter;
  category: EventCategoryFilter;
  sort: EventListSort;
  pageSize: EventListPageSize;
  page: number;
  search: string;
  displayState: EventListProgressState;
};

/** 検索語の最大文字数。SQL側の left(..., 100) と揃える。 */
export const EVENT_SEARCH_MAX_LENGTH = 100;

export type EventListPagination = {
  page: number;
  pageSize: EventListPageSize;
  totalItems: number;
  totalPages: number;
  from: number;
  to: number;
  rangeFrom: number;
  rangeTo: number;
};

export type EventCategoryFilter = "all" | (typeof EVENT_CATEGORIES)[number];

export const terminalStatuses = new Set(["done", "cancelled", "skipped"]);
const ignoredPlanStatuses = new Set(["cancelled", "skipped"]);
const finishedSettlementStatuses = new Set(["not_needed", "settled"]);

export function normalizeCategory(value: string | undefined): EventCategoryFilter {
  return EVENT_CATEGORIES.includes(value as (typeof EVENT_CATEGORIES)[number])
    ? (value as (typeof EVENT_CATEGORIES)[number])
    : "all";
}

export function eventFilterHref(category: EventCategoryFilter) {
  const params = new URLSearchParams();
  if (category !== "all") {
    params.set("category", category);
  }

  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

export type EventCategoryCounts = Record<EventCategoryFilter, number>;

export function countEventsByCategory(events: Array<{ category: string | null }>): EventCategoryCounts {
  const counts = Object.fromEntries([
    ["all", events.length],
    ...EVENT_CATEGORIES.map((category) => [category, 0])
  ]) as EventCategoryCounts;

  events.forEach((event) => {
    if (EVENT_CATEGORIES.includes(event.category as (typeof EVENT_CATEGORIES)[number])) {
      const category = event.category as (typeof EVENT_CATEGORIES)[number];
      counts[category] += 1;
    }
  });

  return counts;
}

export function resolveEventCategoryFilter(
  requestedCategory: EventCategoryFilter,
  counts: EventCategoryCounts
): EventCategoryFilter {
  return requestedCategory !== "all" && counts[requestedCategory] === 0 ? "all" : requestedCategory;
}

/**
 * 検索語をURLとSQLで同じ形にそろえる。
 * 文字数は SQL 側の left() に合わせて「文字」で数える。JavaScript の slice は
 * UTF-16 の単位なので、絵文字が入ると Postgres と切れる位置がずれる。
 */
export function normalizeEventSearch(value: string | undefined): string {
  return [...(value ?? "").trim()].slice(0, EVENT_SEARCH_MAX_LENGTH).join("");
}

/**
 * 下書き（サーバーに無く、cookieだけにある）を検索にかけるための判定。
 * 保存済みのイベントは SQL の ilike が担当するので、こちらは下書き専用。
 */
export function eventMatchesSearch(
  event: { title?: string | null; location_name?: string | null },
  search: string
) {
  if (!search) return true;

  const needle = search.toLowerCase();
  return [event.title, event.location_name].some((value) => (value ?? "").toLowerCase().includes(needle));
}

export function normalizeEventListQuery(query: {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
  search?: string;
  display?: string;
}): EventListQuery {
  const pageSize = Number(query.limit);
  const page = Number(query.page);
  const status = EVENT_LIST_FILTERS.includes(query.status as EventListFilter)
    ? (query.status as EventListFilter)
    : "active";
  const displayState: EventListProgressState =
    status === "active" &&
    EVENT_LIST_PROGRESS_STATES.includes(query.display as (typeof EVENT_LIST_PROGRESS_STATES)[number])
      ? (query.display as EventListProgressState)
      : "all";

  return {
    status,
    category: normalizeCategory(query.category),
    // 既定は開催日が近い順。「新しく作成した順」だと、今日やる予定と半年先の予定が
    // 作成タイミングでバラバラに並んでしまい、次に何があるか一覧から読み取りにくい。
    sort: EVENT_LIST_SORTS.includes(query.sort as EventListSort) ? (query.sort as EventListSort) : "soonest",
    pageSize: EVENT_LIST_PAGE_SIZES.includes(pageSize as EventListPageSize)
      ? (pageSize as EventListPageSize)
      : 10,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    search: normalizeEventSearch(query.search),
    displayState
  };
}

export function getEventStatusesForListFilter(status: EventListFilter) {
  switch (status) {
    case "active":
      return ["interested", "planning", "confirmed"] as const;
    case "cancelled":
      return ["cancelled"] as const;
    case "completed":
      return ["done", "skipped"] as const;
    case "draft":
      return [] as const;
  }
}

export function getEventListSort(sort: EventListSort):
  | { column: "created_at"; ascending: false }
  | { column: "start_date"; ascending: boolean; nullsFirst: false } {
  if (sort === "soonest") {
    return { column: "start_date", ascending: true, nullsFirst: false };
  }

  if (sort === "latest") {
    return { column: "start_date", ascending: false, nullsFirst: false };
  }

  return { column: "created_at", ascending: false };
}

export function getEventSchedule(event: EventListItem, now = new Date()): EventScheduleSummary {
  const confirmedPlans = [...(event.plans ?? [])]
    .filter((plan) => Boolean(plan.confirmed_start_at))
    .sort((left, right) => timestamp(left.confirmed_start_at) - timestamp(right.confirmed_start_at));
  const confirmedPlan = confirmedPlans.find((plan) => {
    const endAt = plan.confirmed_end_at ?? plan.confirmed_start_at;
    return endAt && endOfScheduleTimestamp(endAt, plan.is_all_day === true) >= now.getTime();
  }) ?? confirmedPlans.at(-1);

  if (confirmedPlan?.confirmed_start_at) {
    return {
      startAt: confirmedPlan.confirmed_start_at,
      endAt: confirmedPlan.confirmed_end_at ?? null,
      isAllDay: confirmedPlan.is_all_day === true,
      isConfirmed: true
    };
  }

  return {
    startAt: event.start_date ?? null,
    endAt: event.end_date ?? null,
    isAllDay: true,
    isConfirmed: false
  };
}

export function getEventSettlementState(event: EventListItem): EventSettlementState {
  const plans = event.plans ?? [];
  if (plans.length === 0) return "not_needed";

  const states = plans.map((plan) => {
    const state = plan.settlement_status ?? "not_started";
    return event.status === "cancelled" && state === "not_started" ? "not_needed" : state;
  });
  if (states.includes("settling")) return "settling";
  if (states.includes("needed")) return "needed";
  if (states.some((state) => !finishedSettlementStatuses.has(state))) return "not_started";
  if (states.includes("settled")) return "settled";
  return "not_needed";
}

export function isEventSettlementFinished(event: EventListItem) {
  return finishedSettlementStatuses.has(getEventSettlementState(event));
}

export function isEventLifecycleFinished(event: EventListItem, now = new Date()) {
  if (terminalStatuses.has(event.status)) return true;

  const relevantPlans = (event.plans ?? []).filter((plan) => !ignoredPlanStatuses.has(plan.status ?? ""));
  if (relevantPlans.length > 0) {
    return relevantPlans.every((plan) => {
      const endAt = plan.confirmed_end_at ?? plan.confirmed_start_at;
      if (!endAt) return false;
      return endOfScheduleTimestamp(endAt, plan.is_all_day === true) < now.getTime();
    });
  }

  const endAt = event.end_date ?? event.start_date;
  if (!endAt) return false;

  return endOfScheduleTimestamp(endAt, true) < now.getTime();
}

export function getEventDisplayState(event: EventListItem, now = new Date()): EventDisplayState {
  const lifecycleFinished = isEventLifecycleFinished(event, now);
  const settlementFinished = isEventSettlementFinished(event);
  const plans = event.plans ?? [];

  if (lifecycleFinished && !settlementFinished) return "settlement_waiting";
  if (event.status === "cancelled") return "cancelled";
  if (lifecycleFinished) return "completed";
  if (plans.some((plan) => plan.status === "collecting_answers")) return "answer_waiting";
  if (hasUpcomingConfirmedSchedule(plans, now)) return "event_waiting";
  if (event.status === "interested") return "participant_waiting";
  return "schedule_creation_waiting";
}

export function matchesEventListFilter(event: EventListItem, filter: EventListFilter, now = new Date()) {
  const lifecycleFinished = isEventLifecycleFinished(event, now);
  const settlementFinished = isEventSettlementFinished(event);

  if (filter === "active") return !lifecycleFinished || !settlementFinished;
  if (filter === "cancelled") return event.status === "cancelled";
  if (filter === "completed") return event.status !== "cancelled" && lifecycleFinished && settlementFinished;
  return false;
}

export function filterAndSortEventsForList<T extends EventListItem>(
  events: readonly T[],
  filter: EventListFilter,
  sort: EventListSort,
  now = new Date()
) {
  return events.filter((event) => matchesEventListFilter(event, filter, now)).sort((left, right) => {
    if (sort === "newest") return compareNewest(left.created_at, right.created_at);

    const leftStart = nullableTimestamp(getEventSchedule(left, now).startAt);
    const rightStart = nullableTimestamp(getEventSchedule(right, now).startAt);
    if (leftStart === null && rightStart === null) return compareNewest(left.created_at, right.created_at);
    if (leftStart === null) return 1;
    if (rightStart === null) return -1;

    const difference = sort === "soonest" ? leftStart - rightStart : rightStart - leftStart;
    return difference || compareNewest(left.created_at, right.created_at);
  });
}

export function getEventCardSummary(event: EventListItem, now = new Date()) {
  const settlementState = getEventSettlementState(event);
  const plans = event.plans ?? [];

  return {
    schedule: getEventSchedule(event, now),
    joinedCount: (event.event_members ?? []).filter((member) => member.status === "joined").length,
    coordinationCount: plans.length,
    settlementState,
    displayState: getEventDisplayState(event, now)
  };
}

export function getEventListPagination(
  totalItems: number,
  pageSize: EventListPageSize,
  requestedPage: number
): EventListPagination {
  const safeTotalItems = Math.max(0, totalItems);
  const totalPages = Math.ceil(safeTotalItems / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(Math.max(requestedPage, 1), totalPages);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  return {
    page,
    pageSize,
    totalItems: safeTotalItems,
    totalPages,
    from: safeTotalItems === 0 ? 0 : rangeFrom + 1,
    to: Math.min(rangeTo + 1, safeTotalItems),
    rangeFrom,
    rangeTo
  };
}

export function buildEventListHref(query: EventListQuery, page = query.page) {
  const params = new URLSearchParams();

  if (query.status !== "active") {
    params.set("status", query.status);
  }
  if (query.category !== "all") {
    params.set("category", query.category);
  }
  if (query.sort !== "soonest") {
    params.set("sort", query.sort);
  }
  if (query.pageSize !== 10) {
    params.set("limit", String(query.pageSize));
  }
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.displayState !== "all") {
    params.set("display", query.displayState);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const search = params.toString();
  return search ? `/events?${search}` : "/events";
}

function timestamp(value: string | null | undefined) {
  return nullableTimestamp(value) ?? Number.MAX_SAFE_INTEGER;
}

function nullableTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? null : result;
}

function compareNewest(left: string | null | undefined, right: string | null | undefined) {
  return (nullableTimestamp(right) ?? 0) - (nullableTimestamp(left) ?? 0);
}

function endOfScheduleTimestamp(value: string, isAllDay: boolean) {
  if (isAllDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999+09:00`).getTime();
  }
  return nullableTimestamp(value) ?? Number.MAX_SAFE_INTEGER;
}

function startOfScheduleTimestamp(value: string | null, isAllDay: boolean) {
  if (value && isAllDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000+09:00`).getTime();
  }
  return nullableTimestamp(value);
}

function hasUpcomingConfirmedSchedule(plans: readonly EventListPlan[], now: Date) {
  return plans.some((plan) => {
    if (ignoredPlanStatuses.has(plan.status ?? "")) return false;
    const startAt = startOfScheduleTimestamp(plan.confirmed_start_at ?? null, plan.is_all_day === true);
    return startAt !== null && startAt > now.getTime();
  });
}
