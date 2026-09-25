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

    const replaceState = vi.spyOn(window.history, "replaceState");

    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    expect(screen.getByRole("heading", { name: "7月19日(日)" })).toBeInTheDocument();
    expect(screen.getByText("来週の予定")).toBeInTheDocument();
    // router.replace はホーム全体をサーバーで描き直し、スマホで一番上に戻ってしまう。URLだけ書き換える。
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?action=deadline&date=2026-07-19");
    replaceState.mockRestore();
  });

  it("does not refetch Madoi items while the selected date stays in the loaded month", () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContainEqual(expect.stringContaining("/api/calendar-items"));
  });

  it("shows fresh initial items when the server re-renders the home page", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const item = (title: string) => ({
      id: title,
      kind: "confirmed" as const,
      title,
      startAt: "2026-07-12T10:00:00+09:00",
      endAt: "2026-07-12T11:00:00+09:00"
    });

    const { rerender } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[item("古い予定")]} />
    );
    rerender(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-12" todayDateKey="2026-07-12" initialItems={[item("新しい予定")]} />
    );

    expect(screen.getByText("新しい予定")).toBeInTheDocument();
    expect(screen.queryByText("古い予定")).not.toBeInTheDocument();
  });

  it("drops other months' cached items when the server sends fresh initial items", async () => {
    let augustTitle = "8月の古い予定";
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                id: augustTitle,
                kind: "confirmed",
                title: augustTitle,
                startAt: "2026-08-02T10:00:00+09:00",
                endAt: "2026-08-02T11:00:00+09:00"
              }
            ]
          })
        });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />
    );
    fireEvent.click(screen.getByRole("button", { name: "次の週" }));
    await waitFor(() => {
      expect(screen.getByText("8月の古い予定")).toBeInTheDocument();
    });

    augustTitle = "8月の新しい予定";
    // 8/2 を表示したまま、サーバーから新しい initialItems が届く。8月は取り直す。
    rerender(<HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />);

    await waitFor(() => {
      expect(screen.getByText("8月の新しい予定")).toBeInTheDocument();
    });
    expect(screen.queryByText("8月の古い予定")).not.toBeInTheDocument();
  });

  it("shows an error instead of an empty day when Madoi items for another month fail to load, and retries later", async () => {
    let calendarCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        calendarCalls += 1;
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ connected: true, busy: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    await waitFor(() => {
      expect(screen.getByText("Madoiの予定を取得できませんでした")).toBeInTheDocument();
    });
    expect(screen.queryByText("この日の予定はまだありません。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "前の週" }));
    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    await waitFor(() => {
      expect(calendarCalls).toBe(2);
    });
  });

  it("keeps the displayed month's error when an earlier request for another month fails later", async () => {
    const pending = new Map<string, (response: unknown) => void>();
    const calendarCalls: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        calendarCalls.push(url);
        return new Promise((resolve) => pending.set(url, resolve));
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />);
    // 8/2 → 8/9 → 8/16 → 8/23 → 8/30 → 9/6。8月の取得が終わる前に9月へ進む。
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "次の週" }));
    }
    expect(screen.getByRole("heading", { name: "9月6日(日)" })).toBeInTheDocument();
    await waitFor(() => {
      expect(pending.has("/api/calendar-items?month=2026-09")).toBe(true);
    });

    pending.get("/api/calendar-items?month=2026-09")?.({ ok: false, json: async () => ({}) });
    await waitFor(() => {
      expect(screen.getByText("Madoiの予定を取得できませんでした")).toBeInTheDocument();
    });

    pending.get("/api/calendar-items?month=2026-08")?.({ ok: false, json: async () => ({}) });
    // 8月の失敗が届いても、表示中の9月のエラーは消えず、9月を取り直さない。
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText("Madoiの予定を取得できませんでした")).toBeInTheDocument();
    expect(calendarCalls.filter((url) => url.endsWith("2026-09"))).toHaveLength(1);
  });

  it("refetches a month when returning to it after its request failed while another month was displayed", async () => {
    const pending = new Map<string, (response: unknown) => void>();
    const calendarCalls: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        calendarCalls.push(url);
        return new Promise((resolve) => pending.set(url, resolve));
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />);
    // 8/2 で8月の取得が始まり、終わる前に 9/6 へ進む。
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "次の週" }));
    }
    await waitFor(() => {
      expect(pending.has("/api/calendar-items?month=2026-09")).toBe(true);
    });

    // 9月を表示している間に、8月の取得が失敗する。
    pending.get("/api/calendar-items?month=2026-08")?.({ ok: false, json: async () => ({}) });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 8/30 に戻ったら、8月を取り直す（失敗のまま固まらない）。
    fireEvent.click(screen.getByRole("button", { name: "前の週" }));
    expect(screen.getByRole("heading", { name: "8月30日(日)" })).toBeInTheDocument();
    await waitFor(() => {
      expect(calendarCalls.filter((url) => url.endsWith("2026-08"))).toHaveLength(2);
    });
    expect(screen.queryByText("Madoiの予定を取得できませんでした")).not.toBeInTheDocument();
  });

  it("keeps showing the loading rows while Madoi items for another month are loading, even if Google items arrived", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        return new Promise(() => {});
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          connected: true,
          busy: [{ start: "2026-08-02T10:00:00+09:00", end: "2026-08-02T11:00:00+09:00", title: "歯医者" }]
        })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />
    );
    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    await waitFor(() => {
      expect(screen.getByText("歯医者")).toBeInTheDocument();
    });
    // 予定の行も同じ最低高クラスを持つので、スケルトン（animate-pulse）で見分ける。
    const placeholders = container.querySelectorAll(`div.animate-pulse.${CSS.escape(AGENDA_ITEM_MIN_HEIGHT_CLASS)}`);
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("fetches Madoi items for the new month when the week moves into another month", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/calendar-items")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "confirmed-plan-9",
                kind: "confirmed",
                title: "8月の予定",
                startAt: "2026-08-02T10:00:00+09:00",
                endAt: "2026-08-02T11:00:00+09:00",
                href: "/plans/plan-9"
              }
            ]
          })
        });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-26" todayDateKey="2026-07-26" initialItems={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "次の週" }));

    expect(screen.getByRole("heading", { name: "8月2日(日)" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("8月の予定")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/calendar-items?month=2026-08");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?action=deadline&date=2026-08-02");
    replaceState.mockRestore();
  });

  it("keeps all seven date buttons in shrinkable columns", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />
    );

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    expect(dateGrid).toHaveClass("grid-cols-[repeat(7,minmax(0,1fr))]", "gap-1", "sm:gap-1.5");
    expect(dateGrid?.querySelectorAll("button")).toHaveLength(7);
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("min-w-0", "px-1");
    }
  });

  it("colors Sunday and Saturday weekday labels using the shared calendar convention", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-22" todayDateKey="2026-07-22" initialItems={[]} />
    );

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    const dayButtons = Array.from(dateGrid?.querySelectorAll("button") ?? []);
    const weekdayLabel = (index: number) => dayButtons[index]?.querySelector("span");

    // 週は 7/19(日) 〜 7/25(土)。選択中は7/22(水)なのでactiveの上書きを受けない。
    expect(weekdayLabel(0)).toHaveClass("text-clay-ink");
    expect(weekdayLabel(6)).toHaveClass("text-sky-700");
  });

  it("adds a ring offset to week navigation and day-cell buttons for focus visibility", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />
    );

    expect(screen.getByRole("button", { name: "前の週" })).toHaveClass("focus:ring-offset-2");
    expect(screen.getByRole("button", { name: "次の週" })).toHaveClass("focus:ring-offset-2");

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("focus:ring-offset-2");
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

  it("renders date shortcuts using the shared Button primitive", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />);

    expect(screen.getByRole("button", { name: "今日" })).toHaveClass("from-pine", "to-pine-deep", "text-white");
    expect(screen.getByRole("button", { name: "明日" })).toHaveClass("border-line-strong", "text-ink");
  });
});
