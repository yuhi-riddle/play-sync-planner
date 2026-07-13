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
