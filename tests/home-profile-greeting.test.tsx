import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn()
}));

vi.mock("@/components/home-selected-date-agenda", () => ({ HomeSelectedDateAgenda: () => null }));
vi.mock("@/lib/actions/events", () => ({ discardEventDraftAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseEnv: () => true
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

function mockHomeData(nickname: string | null, email = "account@example.com") {
  const plansQuery = createListQuery([]);
  const notificationsQuery = createListQuery([]);
  const eventDraftQuery = createSingleQuery(null);
  const profileQuery = createSingleQuery({ nickname });

  getCurrentUser.mockResolvedValue({ id: "user-1", email });
  createSupabaseServerClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "plans") return plansQuery;
      if (table === "notifications") return notificationsQuery;
      if (table === "event_drafts") return eventDraftQuery;
      return profileQuery;
    })
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
