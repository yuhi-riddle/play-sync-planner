import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdjustmentCalendarView } from "@/components/adjustment-calendar-view";

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
    expect(fetchMock).toHaveBeenCalledWith("/api/google-calendar/freebusy?month=2026-07", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("keeps Madoi candidates after a Google failure and retries without duplicate items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          busy: [{ start: "2026-07-12T10:00:00+09:00", end: "2026-07-12T11:00:00+09:00", title: "Google予定", location: null }]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdjustmentCalendarView
        month="2026-07"
        selectedDateKey="2026-07-12"
        candidates={[{
          id: "candidate-1",
          planId: "plan-1",
          eventTitle: "Madoi候補",
          planTitle: "調整",
          startAt: "2026-07-12T19:00:00+09:00",
          endAt: "2026-07-12T21:00:00+09:00",
          status: "collecting_answers",
          yes: 1,
          maybe: 0,
          no: 0,
          unanswered: 0
        }]}
      />
    );

    expect(screen.getByText("Madoi候補")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Google Calendarを再試行" })).toBeInTheDocument());
    expect(screen.getByText("Madoi候補")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Google Calendarを再試行" }));

    await waitFor(() => expect(screen.getByText("Google予定")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Google予定")).toHaveLength(1);
  });

  it("uses month-scoped URLs for previous and next controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) }));

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" candidates={[]} />);

    expect(screen.getByRole("link", { name: "前の月" })).toHaveAttribute("href", "/plans?month=2026-06&date=2026-06-01");
    expect(screen.getByRole("link", { name: "次の月" })).toHaveAttribute("href", "/plans?month=2026-08&date=2026-08-01");
    await waitFor(() => expect(screen.getByText("Google Calendarは未連携です")).toBeInTheDocument());
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
});
