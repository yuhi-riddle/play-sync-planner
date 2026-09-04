import { describe, expect, it } from "vitest";

import {
  buildEventListHref,
  countEventsByCategory,
  eventDisplayStateLabels,
  eventMatchesSearch,
  filterAndSortEventsForList,
  getEventCardSummary,
  getEventDisplayState,
  getEventListPagination,
  getEventListSort,
  getEventSchedule,
  getEventSettlementState,
  getEventStatusesForListFilter,
  matchesEventListFilter,
  normalizeEventListQuery,
  normalizeEventSearch,
  resolveEventCategoryFilter
} from "@/lib/domain/event/event-filter";

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
      sort: "soonest",
      pageSize: 10,
      page: 1,
      search: "",
      displayState: "all"
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
      page: 3,
      search: "",
      displayState: "all"
    });

    expect(normalizeEventListQuery({ status: "unknown", sort: "unknown", limit: "25", page: "0" })).toEqual({
      status: "active",
      category: "all",
      sort: "soonest",
      pageSize: 10,
      page: 1,
      search: "",
      displayState: "all"
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
        {
          status: "cancelled",
          category: "live",
          sort: "latest",
          pageSize: 20,
          page: 2,
          search: "",
          displayState: "all"
        },
        3
      )
    ).toBe("/events?status=cancelled&category=live&sort=latest&limit=20&page=3");
  });
});

describe("event search", () => {
  it("検索語はURLに残す", () => {
    expect(
      buildEventListHref(
        {
          status: "active",
          category: "all",
          sort: "soonest",
          pageSize: 10,
          page: 1,
          search: "沖縄 旅行",
          displayState: "all"
        },
        2
      )
    ).toBe("/events?search=%E6%B2%96%E7%B8%84+%E6%97%85%E8%A1%8C&page=2");
  });

  it("検索していなければURLに出さない", () => {
    expect(
      buildEventListHref({
        status: "active",
        category: "all",
        sort: "soonest",
        pageSize: 10,
        page: 1,
        search: "",
        displayState: "all"
      })
    ).toBe("/events");
  });

  it("前後の空白を落として、100文字で切る", () => {
    expect(normalizeEventSearch("  沖縄  ")).toBe("沖縄");
    expect(normalizeEventSearch(undefined)).toBe("");
    expect(normalizeEventSearch("あ".repeat(120))).toHaveLength(100);
  });

  it("100文字の数え方をSQLのleft()に合わせる", () => {
    // JavaScript の slice は UTF-16 単位なので、絵文字だとPostgresと切れる位置がずれる
    expect(normalizeEventSearch("🎫".repeat(120))).toBe("🎫".repeat(100));
  });

  it("検索語を URL から読み取る", () => {
    expect(normalizeEventListQuery({ search: " 沖縄 " }).search).toBe("沖縄");
    expect(normalizeEventListQuery({}).search).toBe("");
  });

  it("下書きはタイトルと場所メモで引っかける", () => {
    const draft = { title: "沖縄旅行", location_name: "那覇" };

    expect(eventMatchesSearch(draft, "沖縄")).toBe(true);
    expect(eventMatchesSearch(draft, "那覇")).toBe(true);
    expect(eventMatchesSearch(draft, "北海道")).toBe(false);
    // 検索していないときは全部通す
    expect(eventMatchesSearch(draft, "")).toBe(true);
  });

  it("下書きの未入力項目でも落ちない", () => {
    expect(eventMatchesSearch({ title: undefined, location_name: null }, "沖縄")).toBe(false);
  });

  it("英字は大小を区別しない", () => {
    expect(eventMatchesSearch({ title: "Summer Live" }, "summer")).toBe(true);
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

  it("waits for schedule creation when only a past confirmed schedule and an unconfirmed plan remain", () => {
    const event = {
      status: "confirmed",
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "settled",
          confirmed_start_at: "2026-07-01",
          confirmed_end_at: "2026-07-01",
          is_all_day: true
        },
        {
          status: "draft",
          settlement_status: "not_started"
        }
      ]
    };

    expect(getEventDisplayState(event, now)).toBe("schedule_creation_waiting");
  });

  it("waits for the event when any confirmed plan is upcoming", () => {
    const event = {
      status: "confirmed",
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_started",
          confirmed_start_at: "2026-07-15T10:00:00+09:00",
          confirmed_end_at: "2026-07-15T14:00:00+09:00"
        },
        {
          status: "date_confirmed",
          settlement_status: "not_started",
          confirmed_start_at: "2026-08-01T10:00:00+09:00",
          confirmed_end_at: "2026-08-01T12:00:00+09:00"
        }
      ]
    };

    expect(getEventSchedule(event, now).startAt).toBe("2026-07-15T10:00:00+09:00");
    expect(getEventDisplayState(event, now)).toBe("event_waiting");
  });

  it("treats an all-day confirmed plan as upcoming only before midnight in Japan", () => {
    const event = {
      status: "confirmed",
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_started",
          confirmed_start_at: "2026-08-01",
          confirmed_end_at: "2026-08-01",
          is_all_day: true
        },
        {
          status: "draft",
          settlement_status: "not_started"
        }
      ]
    };

    expect(getEventDisplayState(event, new Date("2026-07-31T14:59:59Z"))).toBe("event_waiting");
    expect(getEventDisplayState(event, new Date("2026-07-31T15:00:00Z"))).toBe("schedule_creation_waiting");
  });

  it("derives one concrete display state by priority", () => {
    const cases = [
      [{ status: "done", plans: [{ settlement_status: "needed" }] }, "settlement_waiting"],
      [{ status: "cancelled", plans: [{ settlement_status: "needed" }] }, "settlement_waiting"],
      [{ status: "cancelled", plans: [{ settlement_status: "settling" }] }, "settlement_waiting"],
      [{ status: "cancelled", plans: [{ settlement_status: "not_started" }] }, "cancelled"],
      [{ status: "done", plans: [{ settlement_status: "settled" }] }, "completed"],
      [{ status: "planning", plans: [{ status: "collecting_answers", settlement_status: "not_started" }] }, "answer_waiting"],
      [{ status: "confirmed", plans: [{ status: "date_confirmed", settlement_status: "not_started", confirmed_start_at: "2026-08-01T10:00:00+09:00" }] }, "event_waiting"],
      [{ status: "interested", plans: [] }, "participant_waiting"],
      [{ status: "planning", plans: [] }, "schedule_creation_waiting"]
    ] as const;

    for (const [event, expected] of cases) {
      expect(getEventDisplayState(event, now)).toBe(expected);
    }

    expect(eventDisplayStateLabels).toEqual({
      participant_waiting: "参加者待ち",
      schedule_creation_waiting: "日程作成待ち",
      answer_waiting: "回答待ち",
      event_waiting: "開催待ち",
      settlement_waiting: "清算待ち",
      completed: "完了",
      cancelled: "中止"
    });
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
      displayState: "settlement_waiting",
      schedule: { isConfirmed: true }
    });
    expect(summary).not.toHaveProperty("nextAction");
  });

  it("derives one concrete display state by priority", () => {
    const cases = [
      [{ status: "done", plans: [{ settlement_status: "needed" }] }, "settlement_waiting"],
      [{ status: "cancelled", plans: [{ settlement_status: "not_started" }] }, "cancelled"],
      [{ status: "done", plans: [{ settlement_status: "settled" }] }, "completed"],
      [{ status: "planning", plans: [{ status: "collecting_answers", settlement_status: "not_started" }] }, "answer_waiting"],
      [
        {
          status: "confirmed",
          plans: [
            {
              status: "date_confirmed",
              settlement_status: "not_started",
              confirmed_start_at: "2026-08-01T10:00:00+09:00"
            }
          ]
        },
        "event_waiting"
      ],
      [{ status: "interested", plans: [] }, "participant_waiting"],
      [{ status: "planning", plans: [] }, "schedule_creation_waiting"]
    ] as const;

    for (const [event, expected] of cases) {
      expect(getEventDisplayState(event, now)).toBe(expected);
    }

    expect(eventDisplayStateLabels).toEqual({
      participant_waiting: "参加者待ち",
      schedule_creation_waiting: "日程作成待ち",
      answer_waiting: "回答待ち",
      event_waiting: "開催待ち",
      settlement_waiting: "清算待ち",
      completed: "完了",
      cancelled: "中止"
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

describe("normalizeEventListQuery の displayState", () => {
  it("status=active かつ進行状態が5値のいずれかなら採用する", () => {
    const q = normalizeEventListQuery({ status: "active", display: "answer_waiting" });
    expect(q.displayState).toBe("answer_waiting");
  });

  it("status が active 以外なら display は無視して all", () => {
    expect(normalizeEventListQuery({ status: "completed", display: "answer_waiting" }).displayState).toBe("all");
    expect(normalizeEventListQuery({ status: "draft", display: "answer_waiting" }).displayState).toBe("all");
  });

  it("不正な display 値は all", () => {
    expect(normalizeEventListQuery({ status: "active", display: "nope" }).displayState).toBe("all");
    expect(normalizeEventListQuery({ status: "active" }).displayState).toBe("all");
  });
});

describe("buildEventListHref の display", () => {
  const base = normalizeEventListQuery({ status: "active" });

  it("displayState が all 以外なら display= が付く", () => {
    const href = buildEventListHref({ ...base, displayState: "event_waiting" }, 1);
    expect(href).toBe("/events?display=event_waiting");
  });

  it("displayState が all なら display= は付かない", () => {
    expect(buildEventListHref({ ...base, displayState: "all" }, 1)).toBe("/events");
  });

  it("他の条件と共存する", () => {
    const href = buildEventListHref(
      { ...base, category: "live", sort: "latest", displayState: "answer_waiting" },
      2
    );
    expect(href).toContain("display=answer_waiting");
    expect(href).toContain("category=live");
    expect(href).toContain("sort=latest");
    expect(href).toContain("page=2");
  });
});
