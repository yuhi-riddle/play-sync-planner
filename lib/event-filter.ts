import { EVENT_CATEGORIES } from "@/lib/constants";

export const EVENT_LIST_FILTERS = ["active", "draft", "cancelled", "completed"] as const;
export const EVENT_LIST_SORTS = ["newest", "soonest", "latest"] as const;
export const EVENT_LIST_PAGE_SIZES = [10, 20, 50] as const;

export type EventListFilter = (typeof EVENT_LIST_FILTERS)[number];
export type EventListSort = (typeof EVENT_LIST_SORTS)[number];
export type EventListPageSize = (typeof EVENT_LIST_PAGE_SIZES)[number];

export type EventListQuery = {
  status: EventListFilter;
  category: EventCategoryFilter;
  sort: EventListSort;
  pageSize: EventListPageSize;
  page: number;
};

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

export function normalizeEventListQuery(query: {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
}): EventListQuery {
  const pageSize = Number(query.limit);
  const page = Number(query.page);

  return {
    status: EVENT_LIST_FILTERS.includes(query.status as EventListFilter)
      ? (query.status as EventListFilter)
      : "active",
    category: normalizeCategory(query.category),
    sort: EVENT_LIST_SORTS.includes(query.sort as EventListSort) ? (query.sort as EventListSort) : "newest",
    pageSize: EVENT_LIST_PAGE_SIZES.includes(pageSize as EventListPageSize)
      ? (pageSize as EventListPageSize)
      : 10,
    page: Number.isInteger(page) && page > 0 ? page : 1
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
  if (query.sort !== "newest") {
    params.set("sort", query.sort);
  }
  if (query.pageSize !== 10) {
    params.set("limit", String(query.pageSize));
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const search = params.toString();
  return search ? `/events?${search}` : "/events";
}
