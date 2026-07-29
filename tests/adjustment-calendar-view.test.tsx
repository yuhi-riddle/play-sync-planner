import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdjustmentCalendarView,
  GOOGLE_STATUS_MIN_HEIGHT_CLASS,
  TIMELINE_ITEM_MIN_HEIGHT_CLASS
} from "@/components/adjustment-calendar-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdjustmentCalendarView", () => {
  it("shows Madoi candidates and loaded Google Calendar events on the selected day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connected: true,
        busy: [
          {
            start: "2026-07-12T10:00:00+09:00",
            end: "2026-07-12T11:00:00+09:00",
            title: "歯医者",
            location: "新宿"
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdjustmentCalendarView
        month="2026-07"
        selectedDateKey="2026-07-12"
        candidates={[
          {
            id: "candidate-1",
            planId: "plan-1",
            eventTitle: "謎解き公演",
            planTitle: "夜の回",
            startAt: "2026-07-12T19:00:00+09:00",
            endAt: "2026-07-12T21:00:00+09:00",
            status: "collecting_answers",
            yes: 2,
            maybe: 1,
            no: 0,
            unanswered: 1
          }
        ]}
      />
    );

    expect(screen.getByText("謎解き公演")).toBeInTheDocument();
    expect(screen.getByText("Google Calendar")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("歯医者")).toBeInTheDocument();
    });
    expect(screen.getByText("新宿")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/google-calendar/freebusy?month=2026-07");
  });

  it("keeps the month grid in a horizontally scrollable area for narrow screens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: false, busy: [] })
      })
    );

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" candidates={[]} />);

    expect(screen.getByLabelText("日程調整カレンダーの日付一覧")).toHaveClass("overflow-x-auto");
    await waitFor(() => {
      expect(screen.getByText("Google Calendarは未連携です")).toBeInTheDocument();
    });
  });

  it("keeps the Google Calendar status container at the same minimum height while loading and once ready", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, busy: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" candidates={[]} />);

    const statusContainer = screen.getByTestId("adjustment-google-status");
    expect(statusContainer).toHaveClass(GOOGLE_STATUS_MIN_HEIGHT_CLASS);
    expect(screen.getByText("Google Calendarを確認中")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText("Google Calendarを確認中")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("adjustment-google-status")).toHaveClass(GOOGLE_STATUS_MIN_HEIGHT_CLASS);
  });

  it("shows placeholder rows sized like a timeline item while Google Calendar items are still loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const { container } = render(
      <AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" candidates={[]} />
    );

    const placeholders = Array.from(container.querySelectorAll("div")).filter((element) =>
      element.classList.contains(TIMELINE_ITEM_MIN_HEIGHT_CLASS)
    );
    expect(placeholders.length).toBeGreaterThan(0);
    expect(screen.queryByText("この日の候補やGoogle Calendar予定はありません。")).not.toBeInTheDocument();
  });
});
