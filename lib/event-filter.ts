import { EVENT_CATEGORIES } from "@/lib/constants";

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
