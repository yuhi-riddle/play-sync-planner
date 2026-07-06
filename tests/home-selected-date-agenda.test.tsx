import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeSelectedDateAgenda } from "@/components/home-selected-date-agenda";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeSelectedDateAgenda", () => {
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
});
