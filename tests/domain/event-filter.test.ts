import { describe, expect, it } from "vitest";

import {
  buildEventListHref,
  countEventsByCategory,
  filterAndSortEventsForList,
  getEventCardSummary,
  getEventSchedule,
  getEventListPagination,
  getEventListSort,
  getEventSettlementState,
  getEventStatusesForListFilter,
  matchesEventListFilter,
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
  it("defaults to the work list and keeps the legacy status mapping available", () => {
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

  it("normalizes a page number outside JavaScript's safe integer range", () => {
    expect(normalizeEventListQuery({ page: "9007199254740992" }).page).toBe(1);
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

describe("event work state", () => {
  const now = new Date("2026-07-15T12:00:00+09:00");

  it("keeps ended and cancelled events visible while settlement remains", () => {
    const ended = { status: "done", plans: [{ settlement_status: "needed" }] };
    const cancelled = { status: "cancelled", plans: [{ settlement_status: "settling" }] };
    const finished = { status: "done", plans: [{ settlement_status: "settled" }] };

    expect(matchesEventListFilter(ended, "active", now)).toBe(true);
    expect(matchesEventListFilter(cancelled, "active", now)).toBe(true);
    expect(matchesEventListFilter(finished, "active", now)).toBe(false);
    expect(matchesEventListFilter(finished, "completed", now)).toBe(true);
    expect(matchesEventListFilter(cancelled, "completed", now)).toBe(false);
    expect(matchesEventListFilter(cancelled, "cancelled", now)).toBe(true);
  });

  it("does not keep a cancelled event active when settlement never started", () => {
    const event = { status: "cancelled", plans: [{ settlement_status: "not_started" }] };

    expect(getEventSettlementState(event)).toBe("not_needed");
    expect(matchesEventListFilter(event, "active", now)).toBe(false);
    expect(matchesEventListFilter(event, "cancelled", now)).toBe(true);
  });

  it("moves a past confirmed event to completed only after settlement finishes", () => {
    const event = {
      status: "confirmed",
      plans: [{
        status: "date_confirmed",
        settlement_status: "needed",
        confirmed_start_at: "2026-07-01T10:00:00+09:00",
        confirmed_end_at: "2026-07-01T12:00:00+09:00"
      }]
    };

    expect(matchesEventListFilter(event, "active", now)).toBe(true);
    expect(matchesEventListFilter({ ...event, plans: [{ ...event.plans[0], settlement_status: "settled" }] }, "completed", now)).toBe(true);
  });

  it("keeps an all-day event active through the end of the day in Japan", () => {
    const event = { status: "confirmed", start_date: "2026-07-15", end_date: "2026-07-15", plans: [] };

    expect(matchesEventListFilter(event, "active", new Date("2026-07-15T14:00:00Z"))).toBe(true);
    expect(matchesEventListFilter(event, "completed", new Date("2026-07-15T15:00:00Z"))).toBe(true);
  });

  it("keeps an event active while any confirmed schedule is still upcoming", () => {
    const event = {
      status: "confirmed",
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "settled",
          confirmed_start_at: "2026-07-01T10:00:00+09:00",
          confirmed_end_at: "2026-07-01T12:00:00+09:00"
        },
        {
          status: "date_confirmed",
          settlement_status: "not_started",
          confirmed_start_at: "2026-08-01T10:00:00+09:00",
          confirmed_end_at: "2026-08-01T12:00:00+09:00"
        }
      ]
    };

    expect(matchesEventListFilter(event, "active", now)).toBe(true);
    expect(getEventSchedule(event, now).startAt).toBe("2026-08-01T10:00:00+09:00");
  });

  it("summarizes the information needed on an event card", () => {
    const summary = getEventCardSummary({
      status: "done",
      event_members: [{ status: "joined" }, { status: "joined" }, { status: "removed" }],
      plans: [{
        status: "date_confirmed",
        settlement_status: "needed",
        confirmed_start_at: "2026-07-01T10:00:00+09:00",
        confirmed_end_at: "2026-07-01T12:00:00+09:00"
      }]
    }, now);

    expect(summary).toMatchObject({
      joinedCount: 2,
      coordinationCount: 1,
      settlementState: "needed",
      nextAction: "清算を確認",
      schedule: { isConfirmed: true }
    });
  });

  it("sorts by the confirmed schedule shown on the card", () => {
    const events = [
      { id: "none", status: "planning", created_at: "2026-07-03", plans: [] },
      { id: "later", status: "confirmed", created_at: "2026-07-02", plans: [{ settlement_status: "not_started", confirmed_start_at: "2026-08-20" }] },
      { id: "sooner", status: "confirmed", created_at: "2026-07-01", plans: [{ settlement_status: "not_started", confirmed_start_at: "2026-08-10" }] }
    ];

    expect(filterAndSortEventsForList(events, "active", "soonest", now).map((event) => event.id)).toEqual([
      "sooner",
      "later",
      "none"
    ]);
  });
});
