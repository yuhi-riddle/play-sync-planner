import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn()
}));

vi.mock("@/components/home/home-selected-date-agenda", () => ({ HomeSelectedDateAgenda: () => null }));
vi.mock("@/lib/actions/event/events", () => ({ discardEventDraftAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  createSupabaseAdminClient: vi.fn(),
  getCurrentUser,
  hasSupabaseEnv: () => true,
  hasSupabaseAdminEnv: () => false
}));

import HomePage from "@/app/page";

function createListQuery(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null })
  };
}

function createSingleQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null })
  };
}

function createResolvingQuery(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data, error: null })
  };
}

function mockHomeData(nickname: string | null, email = "account@example.com") {
  const notificationsQuery = createListQuery([]);
  const eventDraftQuery = createSingleQuery(null);
  const profileQuery = createSingleQuery({ nickname });
  const membershipQuery = createResolvingQuery([]);

  getCurrentUser.mockResolvedValue({ id: "user-1", email });
  createSupabaseServerClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "notifications") return notificationsQuery;
      if (table === "event_drafts") return eventDraftQuery;
      if (table === "event_members") return membershipQuery;
      return profileQuery;
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null })
  });
}

describe("HomePage profile greeting", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  it("prefers the saved profile nickname", async () => {
    mockHomeData("まどか");

    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/こんにちは、まどか さん/)).toBeInTheDocument();
  });

  it("keeps the email name fallback when the profile nickname is empty", async () => {
    mockHomeData("  ", "fallback@example.com");

    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/こんにちは、fallback さん/)).toBeInTheDocument();
  });
});
