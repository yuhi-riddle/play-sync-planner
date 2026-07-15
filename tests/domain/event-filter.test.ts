import { describe, expect, it } from "vitest";

import {
  buildEventListHref,
  countEventsByCategory,
  getEventListPagination,
  getEventListSort,
  getEventStatusesForListFilter,
  normalizeEventListQuery,
  resolveEventCategoryFilter
} from "@/lib/event-filter";

describe("event category filtering", () => {
  it("counts events by category", () => {
    expect(
      countEventsByCategory([
        { category: "live" },
        { category: "live" },
        { category: "travel" }
      ])
    ).toMatchObject({
      all: 3,
      live: 2,
      travel: 1,
      nazotoki: 0
    });
  });

  it("falls back to all when the requested category has no events", () => {
    const counts = countEventsByCategory([{ category: "live" }]);

    expect(resolveEventCategoryFilter("nazotoki", counts)).toBe("all");
    expect(resolveEventCategoryFilter("live", counts)).toBe("live");
  });
});

describe("event list query", () => {
  it("defaults to active events and excludes drafts, cancelled events, and completed events", () => {
    expect(normalizeEventListQuery({})).toEqual({
      status: "active",
      category: "all",
      sort: "newest",
      pageSize: 10,
      page: 1
    });
    expect(getEventStatusesForListFilter("active")).toEqual(["interested", "planning", "confirmed"]);
    expect(getEventStatusesForListFilter("draft")).toEqual([]);
    expect(getEventStatusesForListFilter("cancelled")).toEqual(["cancelled"]);
    expect(getEventStatusesForListFilter("completed")).toEqual(["done", "skipped"]);
  });

  it("normalizes selectable filters, sorting, page size, and page number", () => {
    expect(
      normalizeEventListQuery({
        status: "completed",
        category: "travel",
        sort: "soonest",
        limit: "50",
        page: "3"
      })
    ).toEqual({
      status: "completed",
      category: "travel",
      sort: "soonest",
      pageSize: 50,
      page: 3
    });

    expect(normalizeEventListQuery({ status: "unknown", sort: "unknown", limit: "25", page: "0" })).toEqual({
      status: "active",
      category: "all",
      sort: "newest",
      pageSize: 10,
      page: 1
    });
  });

  it("maps display sorting to database ordering", () => {
    expect(getEventListSort("newest")).toEqual({ column: "created_at", ascending: false });
    expect(getEventListSort("soonest")).toEqual({ column: "start_date", ascending: true, nullsFirst: false });
    expect(getEventListSort("latest")).toEqual({ column: "start_date", ascending: false, nullsFirst: false });
  });

  it("builds pagination and preserves list settings in page links", () => {
    expect(getEventListPagination(46, 20, 2)).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 46,
      totalPages: 3,
      from: 21,
      to: 40,
      rangeFrom: 20,
      rangeTo: 39
    });

    expect(
      buildEventListHref(
        { status: "cancelled", category: "live", sort: "latest", pageSize: 20, page: 2 },
        3
      )
    ).toBe("/events?status=cancelled&category=live&sort=latest&limit=20&page=3");
  });
});
