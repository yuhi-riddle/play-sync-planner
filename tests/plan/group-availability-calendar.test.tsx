import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AVAILABILITY_STATUS_MIN_HEIGHT_CLASS, GroupAvailabilityCalendar } from "@/components/plan/group-availability-calendar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GroupAvailabilityCalendar", () => {
  it("shows aggregate availability without event details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          participantCount: 2,
          slots: [
            { start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 },
            { start: "2026-07-15T10:15:00+09:00", end: "2026-07-15T10:30:00+09:00", availableCount: 1 }
          ]
        })
      }))
    );

    render(
      <GroupAvailabilityCalendar
        eventId="event-1"
        visibleMonth="2026-07"
        selectedRange={{ start: "2026-07-15T10:00", end: "2026-07-15T10:30" }}
      />
    );

    expect(await screen.findByText("参加者全体の空きやすさ")).toBeInTheDocument();
    expect(screen.getByText("参加者 2人")).toBeInTheDocument();
    expect(screen.getByText("選択中: 空き 1/2人以上")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "空き状況を更新" })).toBeEnabled();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/events/event-1/availability?month=2026-07", expect.anything()));
  });

  it("returns daily availability summaries to the date picker", async () => {
    const onAvailabilityByDate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          participantCount: 2,
          slots: [
            { start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 },
            { start: "2026-07-15T10:15:00+09:00", end: "2026-07-15T10:30:00+09:00", availableCount: 1 }
          ]
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" selectedRange={null} onAvailabilityByDate={onAvailabilityByDate} />);

    await waitFor(() =>
      expect(onAvailabilityByDate).toHaveBeenLastCalledWith({
        "2026-07-15": { averageAvailableCount: 1.5, participantCount: 2 }
      })
    );
  });

  it("shows the access message without offering a retry when the API returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: "日程調整中の主催者だけが空き状況を集計できます。" })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" selectedRange={null} />);

    expect(await screen.findByText("日程調整中の主催者だけが空き状況を集計できます。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "空き状況を更新" })).not.toBeInTheDocument();
  });

  it("keeps the aria-live status block at the same minimum height while loading and once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          participantCount: 2,
          slots: [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 }]
        })
      }))
    );

    const { container } = render(
      <GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" selectedRange={null} />
    );

    const statusBlock = container.querySelector('[aria-live="polite"]');
    expect(statusBlock).toHaveClass(AVAILABILITY_STATUS_MIN_HEIGHT_CLASS);

    await waitFor(() => {
      expect(screen.getByText("参加者 2人")).toBeInTheDocument();
    });
    expect(container.querySelector('[aria-live="polite"]')).toHaveClass(AVAILABILITY_STATUS_MIN_HEIGHT_CLASS);
  });
});
