import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeMonthCalendar } from "@/components/home-month-calendar";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeMonthCalendar", () => {
  it("shows Madoi items and loaded Google Calendar items on the selected day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      })
    );

    render(
      <HomeMonthCalendar
        month="2026-07"
        selectedDateKey="2026-07-12"
        initialItems={[
          {
            id: "candidate-1",
            kind: "collecting",
            title: "謎解き公演",
            subtitle: "夜の回",
            startAt: "2026-07-12T19:00:00+09:00",
            endAt: "2026-07-12T21:00:00+09:00",
            href: "/plans/plan-1"
          }
        ]}
      />
    );

    expect(screen.getAllByText("調整中").length).toBeGreaterThan(0);
    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText("Google Calendar")).toBeInTheDocument();
    expect(screen.getByText("謎解き公演")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("歯医者")).toBeInTheDocument();
    });
    expect(screen.getByText("新宿")).toBeInTheDocument();
  });
});
