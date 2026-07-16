import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect
}));
vi.mock("@/lib/actions/events", () => ({ cancelEventAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv: () => true
}));

import EventsPage from "@/app/events/page";

function createEventQuery(data: Array<Record<string, unknown>>, count: number) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn()
  };

  query.range.mockImplementation((from: number, to: number) =>
    Promise.resolve({ data: data.slice(from, to + 1), count, error: null })
  );

  return query;
}

function createDraftQuery(draft: Record<string, unknown> | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: draft, error: null })
  };
}

describe("EventsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("shows active events by default and exposes the saved draft count", async () => {
    const eventQuery = createEventQuery(
      [
        {
          id: "event-1",
          title: "夏ライブ",
          category: "live",
          start_date: "2026-08-01",
          end_date: "2026-08-01",
          location_name: "東京",
          status: "planning",
          plans: [{ id: "plan-1" }]
        }
      ],
      1
    );
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(eventQuery.in).not.toHaveBeenCalled();
    expect(eventQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(eventQuery.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(eventQuery.range).toHaveBeenCalledWith(0, 499);
    expect(screen.getByText("下書き 1件")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "夏ライブ" })).toBeInTheDocument();
  });

  it("applies category in the database and status and sorting in the work-list calculation", async () => {
    const eventQuery = createEventQuery(
      [
        {
          id: "event-2",
          title: "中止したライブ",
          category: "live",
          start_date: "2026-09-01",
          end_date: "2026-09-01",
          location_name: null,
          status: "cancelled",
          plans: []
        }
      ],
      46
    );
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(
      await EventsPage({
        searchParams: Promise.resolve({
          status: "cancelled",
          category: "live",
          sort: "soonest",
          limit: "20",
          page: "1"
        })
      })
    );

    expect(eventQuery.in).not.toHaveBeenCalled();
    expect(eventQuery.eq).toHaveBeenCalledWith("category", "live");
    expect(eventQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(eventQuery.range).toHaveBeenCalledWith(0, 499);
    expect(screen.queryByRole("button", { name: "イベントを中止" })).not.toBeInTheDocument();
  });

  it("shows the saved draft instead of querying event rows when draft is selected", async () => {
    const eventQuery = createEventQuery([], 0);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel", location_name: "札幌" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft" }) }));

    expect(eventQuery.range).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "入力途中の旅行" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toHaveAttribute(
      "href",
      "/events/new?resume=draft"
    );
  });

  it("redirects to the last available page when the requested page is out of range", async () => {
    const eventQuery = createEventQuery(
      Array.from({ length: 15 }, (_, index) => ({
        id: `event-${index}`,
        title: `イベント${index}`,
        category: "other",
        start_date: null,
        end_date: null,
        location_name: null,
        status: "planning",
        created_at: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
        plans: [],
        event_members: []
      })),
      15
    );
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    await expect(EventsPage({ searchParams: Promise.resolve({ page: "3" }) })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/events?page=2");
  });

  it("loads every event across database batches before filtering", async () => {
    const events = Array.from({ length: 501 }, (_, index) => ({
      id: `event-${index}`,
      title: `イベント${index}`,
      category: "other",
      start_date: null,
      end_date: null,
      location_name: null,
      status: "planning",
      created_at: `2026-07-15T00:${String(index % 60).padStart(2, "0")}:00Z`,
      plans: [],
      event_members: []
    }));
    const eventQuery = createEventQuery(events, events.length);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(eventQuery.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(eventQuery.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(screen.getByText("1-10 / 501件")).toBeInTheDocument();
  });
});
