import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENDA_ITEM_MIN_HEIGHT_CLASS,
  GOOGLE_STATUS_MIN_HEIGHT_CLASS,
  HomeSelectedDateAgenda
} from "@/components/home/home-selected-date-agenda";

const navigationMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
  useSearchParams: () => new URLSearchParams("action=deadline")
}));

afterEach(() => {
  navigationMocks.replace.mockReset();
  vi.unstubAllGlobals();
});

describe("HomeSelectedDateAgenda", () => {
  it("labels the agenda as the selected date instead of today", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[]} />);

    expect(screen.getByRole("heading", { name: "選択日の予定" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "今日の予定" })).not.toBeInTheDocument();
  });

  it("shows only items on the selected date", async () => {
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
          },
          {
            start: "2026-07-13T10:00:00+09:00",
            end: "2026-07-13T11:00:00+09:00",
            title: "翌日の予定",
            location: "渋谷"
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HomeSelectedDateAgenda
        selectedDateKey="2026-07-12"
        todayDateKey="2026-07-12"
        initialItems={[
          {
            id: "candidate-1",
            kind: "collecting",
            title: "候補日時",
            startAt: "2026-07-12T19:00:00+09:00",
            endAt: "2026-07-12T21:00:00+09:00",
            href: "/plans/plan-1"
          },
          {
            id: "tomorrow-1",
            kind: "confirmed",
            title: "翌日のMadoi予定",
            startAt: "2026-07-13T19:00:00+09:00",
            endAt: "2026-07-13T21:00:00+09:00",
            href: "/plans/plan-2"
          }
        ]}
      />
    );

    expect(screen.getByText("候補日時")).toBeInTheDocument();
    expect(screen.queryByText("翌日のMadoi予定")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("歯医者")).toBeInTheDocument();
    });
    expect(screen.queryByText("翌日の予定")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/google-calendar/freebusy?month=2026-07");
  });

  it("switches the selected date immediately and keeps the active notification filter", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(
      <HomeSelectedDateAgenda
        selectedDateKey="2026-07-12"
        todayDateKey="2026-07-12"
        initialItems={[
          {
            id: "next-week",
            kind: "confirmed",
            title: "来週の予定",
            startAt: "2026-07-19T10:00:00+09:00",
            endAt: "2026-07-19T11:00:00+09:00"
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    expect(screen.getByRole("heading", { name: "7月19日(日)" })).toBeInTheDocument();
    expect(screen.getByText("来週の予定")).toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenCalledWith("/?action=deadline&date=2026-07-19", { scroll: false });
  });

  it("keeps all seven date buttons in shrinkable columns", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />
    );

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    expect(dateGrid).toHaveClass("grid-cols-[repeat(7,minmax(0,1fr))]", "gap-0.5", "sm:gap-1");
    expect(dateGrid?.querySelectorAll("button")).toHaveLength(7);
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("min-w-0", "px-0.5");
    }
  });

  it("keeps the Google Calendar status row at the same minimum height while loading and once ready", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ connected: true, busy: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[]} />);

    const statusRow = screen.getByText("Google Calendarを確認中", { exact: false }).closest('[aria-live="polite"]');
    expect(statusRow).toHaveClass(GOOGLE_STATUS_MIN_HEIGHT_CLASS);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const statusRowAfterReady = document.querySelector('[aria-live="polite"]');
    await waitFor(() => {
      expect(statusRowAfterReady?.textContent).toBe("");
    });
    expect(statusRowAfterReady).toHaveClass(GOOGLE_STATUS_MIN_HEIGHT_CLASS);
  });

  it("shows placeholder rows sized like an agenda item while Google Calendar items are still loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[]} />
    );

    const placeholders = Array.from(container.querySelectorAll("div")).filter((element) =>
      element.classList.contains(AGENDA_ITEM_MIN_HEIGHT_CLASS)
    );
    expect(placeholders.length).toBeGreaterThan(0);
    expect(screen.queryByText("この日の予定はまだありません。")).not.toBeInTheDocument();
  });
});
