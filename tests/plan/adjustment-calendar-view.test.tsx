import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdjustmentCalendarView,
  GOOGLE_STATUS_MIN_HEIGHT_CLASS,
  TIMELINE_ITEM_MIN_HEIGHT_CLASS
} from "@/components/plan/adjustment-calendar-view";

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
        todayDateKey="2026-07-01"
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
    // タイムラインの日時は曜日つき（見出しの日付と食い違って見えないように）。2026-07-12 は日曜。
    expect(screen.getByText(/2026\/07\/12\(日\) 19:00/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("歯医者")).toBeInTheDocument();
    });
    expect(screen.getByText("新宿")).toBeInTheDocument();
    expect(screen.getByText(/2026\/07\/12\(日\) 10:00 - 11:00/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/google-calendar/freebusy?month=2026-07");
  });

  it("375px に7列が収まるよう、月グリッドに固定の最小幅を持たせない", async () => {
    // かつては min-w-[24rem]（384px）だった。375px 端末でグリッドに使える幅は 301px しかなく、
    // 金曜の途中から右が隠れて土曜が完全に見えなくなっていた。日程を決める画面で
    // 週末が初期表示に出ないのは困るので、幅に追従させる。
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" todayDateKey="2026-07-01" candidates={[]} />);

    const scroller = screen.getByLabelText("日程調整カレンダーの日付一覧");
    const sizer = scroller.firstElementChild as HTMLElement;
    expect(sizer.className).toBe("");

    await waitFor(() => {
      expect(screen.getByText("Google Calendarは未連携です")).toBeInTheDocument();
    });
  });

  it("モバイルは溝と余白を詰めて、セルに回す幅を稼ぐ", async () => {
    // 幅を削る先はセルではなく余白。溝 4->2px、カード余白 20->12px にすることで、
    // 7列を収めたうえで1日あたりの幅は min-w を外すだけの場合より広くなる。
    // sm: 以上は現状のまま（components/home/home-selected-date-agenda.tsx と同じ流儀）。
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    const { container } = render(
      <AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" todayDateKey="2026-07-01" candidates={[]} />
    );

    expect(screen.getByTestId("adjustment-month-grid")).toHaveClass("gap-0.5", "sm:gap-1");

    const card = container.querySelector("section.rounded-card") as HTMLElement;
    expect(card).toHaveClass("p-3", "sm:p-5");
    // 既定の p-5 が残っていると、生成CSSの順序で p-3 が負けて余白が詰まらない。
    expect(card.className.split(" ")).not.toContain("p-5");

    await waitFor(() => {
      expect(screen.getByText("Google Calendarは未連携です")).toBeInTheDocument();
    });
  });

  it("keeps the month grid in a horizontally scrollable area for narrow screens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: false, busy: [] })
      })
    );

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" todayDateKey="2026-07-01" candidates={[]} />);

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

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" todayDateKey="2026-07-01" candidates={[]} />);

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
      <AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-12" todayDateKey="2026-07-01" candidates={[]} />
    );

    const placeholders = Array.from(container.querySelectorAll("div")).filter((element) =>
      element.classList.contains(TIMELINE_ITEM_MIN_HEIGHT_CLASS)
    );
    expect(placeholders.length).toBeGreaterThan(0);
    expect(screen.queryByText("この日の候補やGoogle Calendar予定はありません。")).not.toBeInTheDocument();
  });

  it("今日の升目に「今日」ラベルを出す（当月表示・別日を選択中）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-10" todayDateKey="2026-07-01" candidates={[]} />);

    await waitFor(() => {
      expect(screen.getByText("今日")).toBeInTheDocument();
    });
  });

  it("表示月が当月でなければ「今日」ラベルは出ない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    render(<AdjustmentCalendarView month="2026-09" selectedDateKey="2026-09-10" todayDateKey="2026-07-01" candidates={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId("adjustment-month-grid")).toBeInTheDocument();
    });
    expect(screen.queryByText("今日")).not.toBeInTheDocument();
  });

  it("別の月を表示中は「今日に戻る」リンクを出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    render(<AdjustmentCalendarView month="2026-09" selectedDateKey="2026-09-10" todayDateKey="2026-07-01" candidates={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "今日に戻る" })).toHaveAttribute(
        "href",
        "/plans?month=2026-07&date=2026-07-01"
      );
    });
  });

  it("当月を表示中は「今日に戻る」リンクを出さない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) })
    );

    render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-10" todayDateKey="2026-07-01" candidates={[]} />);

    await waitFor(() => {
      expect(screen.getByTestId("adjustment-month-grid")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "今日に戻る" })).not.toBeInTheDocument();
  });
});
