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

function createEventQuery(data: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data, error: null })
  };
}

function createRpcResult(eventIds: string[], totalCount: number) {
  return vi.fn().mockResolvedValue({
    data: [{ event_ids: eventIds, total_count: totalCount }],
    error: null
  });
}

function makeEvent(id: string, title: string) {
  return {
    id,
    title,
    category: "other",
    start_date: null,
    end_date: null,
    location_name: null,
    status: "planning",
    created_at: "2026-07-15T00:00:00Z",
    plans: [],
    event_members: []
  };
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
    const eventQuery = createEventQuery([makeEvent("event-1", "夏ライブ")]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("下書き 1件")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "夏ライブ" })).toBeInTheDocument();
  });

  it("asks the database for one page and fetches only the returned event ids", async () => {
    const eventQuery = createEventQuery([
      makeEvent("event-2", "2番目"),
      makeEvent("event-1", "1番目")
    ]);
    const rpc = createRpcResult(["event-1", "event-2"], 1001);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({
      searchParams: Promise.resolve({
        status: "completed",
        category: "travel",
        sort: "soonest",
        limit: "20",
        page: "2"
      })
    }));

    expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", {
      p_filter: "completed",
      p_category: "travel",
      p_sort: "soonest",
      p_limit: 20,
      p_offset: 20
    });
    expect(eventQuery.in).toHaveBeenCalledWith("id", ["event-1", "event-2"]);
    expect(screen.getAllByRole("heading", { level: 2, name: /番目/ }).map((heading) => heading.textContent)).toEqual([
      "1番目",
      "2番目"
    ]);
    expect(screen.getByText("21-40 / 1001件")).toBeInTheDocument();
  });

  it("shows the saved draft instead of querying event rows when draft is selected", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = vi.fn();
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel", location_name: "札幌" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft" }) }));

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "入力途中の旅行" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toHaveAttribute(
      "href",
      "/events/new?resume=draft"
    );
  });

  it("redirects to the last available page when the requested page is out of range", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 15);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    await expect(EventsPage({ searchParams: Promise.resolve({ page: "3" }) })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/events?page=2");
  });

  it("passes an offset beyond the PostgreSQL integer range without overflowing", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 2_147_483_660);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ page: "214748366" }) }));

    expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", expect.objectContaining({
      p_limit: 10,
      p_offset: 2_147_483_650
    }));
  });
});
