import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan/plan-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanForm group availability", () => {
  it("shows anonymous group availability while selecting a candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          slots: [
            { start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 },
            { start: "2026-07-15T10:15:00+09:00", end: "2026-07-15T10:30:00+09:00", availableCount: 1 }
          ],
          dailyBusySummaries: {}
        })
      }))
    );

    render(<PlanForm action={vi.fn()} submitLabel="作成" eventId="event-1" calendarAvailability={{ enabled: true }} />);

    expect(await screen.findByText("参加者全体の空き状況")).toBeInTheDocument();
    expect(await screen.findByText("参加者 2人中 2人分のカレンダー")).toBeInTheDocument();
  });

  it("誰か1人でも終日予定があると、他の状態より優先してグレー表示になる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          slots: [],
          dailyBusySummaries: {
            "2026-07-15": { maxBusyCount: 2, allDayBusyCount: 1 }
          }
        })
      }))
    );

    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventId="event-1" />);

    const dayButton = await screen.findByLabelText(/7月15日.*を選択/);
    await waitFor(() => expect(dayButton.className).toContain("bg-subtle/28"));
  });

  it("複数人予定があると skywash の濃い方になる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 3,
          memberCount: 3,
          slots: [],
          dailyBusySummaries: {
            "2026-07-15": { maxBusyCount: 2, allDayBusyCount: 0 }
          }
        })
      }))
    );

    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventId="event-1" />);

    const dayButton = await screen.findByLabelText(/7月15日.*を選択/);
    await waitFor(() => expect(dayButton.className).toContain("bg-skywash/85"));
  });
});
