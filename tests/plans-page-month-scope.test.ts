import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseEnv: () => true
}));
vi.mock("@/components/adjustment-calendar-view", () => ({
  AdjustmentCalendarView: ({ month, candidates }: { month: string; candidates: unknown[] }) =>
    React.createElement("div", { "data-month": month, "data-candidates": candidates.length })
}));

import PlansPage from "@/app/plans/page";

describe("PlansPage month-scoped calendar data", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc
    });
  });

  it("calls the normalized month RPC exactly once", async () => {
    render(await PlansPage({ searchParams: Promise.resolve({ month: "2026-07" }) }));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_calendar_items", { p_month: "2026-07-01" });
  });

  it("falls back to the current Tokyo month for an invalid month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00+09:00"));

    render(await PlansPage({ searchParams: Promise.resolve({ month: "2026-19-not-a-month" }) }));

    expect(rpc).toHaveBeenCalledWith("list_calendar_items", { p_month: "2026-07-01" });
    vi.useRealTimers();
  });

  it("keeps all-period and service-role reads out of the page", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).not.toContain('.from("event_members")');
    expect(page).not.toContain('createSupabaseAdminClient');
    expect(page).not.toContain('.from("plans")');
    expect(page).toContain('list_calendar_items');
  });
});
