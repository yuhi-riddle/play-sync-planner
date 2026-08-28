import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AVAILABILITY_STATUS_MIN_HEIGHT_CLASS, GroupAvailabilityCalendar } from "@/components/plan/group-availability-calendar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GroupAvailabilityCalendar", () => {
  it("returns daily busy summaries to the date picker", async () => {
    const onAvailabilityByDate = vi.fn();
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
            "2026-07-15": { maxBusyCount: 1, allDayBusyCount: 0, segments: [0, 0, 0, 0, 0, 0] }
          }
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" onAvailabilityByDate={onAvailabilityByDate} />);

    await waitFor(() =>
      expect(onAvailabilityByDate).toHaveBeenLastCalledWith({
        "2026-07-15": { maxBusyCount: 1, allDayBusyCount: 0, segments: [0, 0, 0, 0, 0, 0] }
      })
    );
  });

  it("誰も連携していないときは、空きゼロではなく集計できないと伝える", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 0,
          memberCount: 4,
          slots: [],
          dailyBusySummaries: {}
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />);

    expect(await screen.findByText(/カレンダーを連携している参加者がまだいません/)).toBeInTheDocument();
    expect(screen.queryByText(/人分のカレンダー/)).not.toBeInTheDocument();
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

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />);

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
          connectedCount: 2,
          memberCount: 2,
          slots: [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 }],
          dailyBusySummaries: {}
        })
      }))
    );

    const { container } = render(
      <GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />
    );

    const statusBlock = container.querySelector('[aria-live="polite"]');
    expect(statusBlock).toHaveClass(AVAILABILITY_STATUS_MIN_HEIGHT_CLASS);

    await waitFor(() => {
      expect(screen.getByText("参加者 2人中 2人分のカレンダー")).toBeInTheDocument();
    });
    expect(container.querySelector('[aria-live="polite"]')).toHaveClass(AVAILABILITY_STATUS_MIN_HEIGHT_CLASS);
  });

  it("onConnectionStatus に連携人数を渡す", async () => {
    const onConnectionStatus = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 3,
          dailyBusySummaries: {}
        })
      }))
    );

    render(
      <GroupAvailabilityCalendar
        eventId="event-1"
        visibleMonth="2026-07"
        onConnectionStatus={onConnectionStatus}
      />
    );

    await waitFor(() => expect(onConnectionStatus).toHaveBeenCalledWith({ connectedCount: 2, memberCount: 3 }));
  });

  it("selectedRange 相当の「選択中」文言はもう表示しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          dailyBusySummaries: {}
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />);

    expect(await screen.findByText("参加者 2人中 2人分のカレンダー")).toBeInTheDocument();
    expect(screen.queryByText(/選択中: 空き/)).not.toBeInTheDocument();
    expect(screen.queryByText(/日時を選ぶと、その候補で/)).not.toBeInTheDocument();
  });

  it("一部しか連携していないとき、未連携の人数を警告文として出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 5,
          slots: [],
          dailyBusySummaries: {}
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />);

    expect(await screen.findByText("参加者 5人中 2人分のカレンダー")).toBeInTheDocument();
    expect(screen.getByText(/未連携の3人はこの集計に入っていません/)).toBeInTheDocument();
  });
});
