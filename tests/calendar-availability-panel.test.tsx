import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarAvailabilityPanel } from "@/components/calendar-availability-panel";

const busyRanges = [
  {
    start: "2026-07-01T10:00:00+09:00",
    end: "2026-07-01T11:00:00+09:00",
    title: "謎解き公演",
    location: "新宿"
  }
];

describe("CalendarAvailabilityPanel", () => {
  it("links to settings when disconnected", () => {
    render(
      <CalendarAvailabilityPanel
        connected={false}
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T10:00"
        candidateEnd="2026-07-01T12:00"
        busyRanges={[]}
      />
    );

    expect(screen.getByRole("link", { name: "設定で連携する" })).toHaveAttribute("href", "/settings");
  });

  it("shows calendar event title and location", () => {
    render(
      <CalendarAvailabilityPanel
        connected
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T12:00"
        candidateEnd="2026-07-01T13:00"
        busyRanges={busyRanges}
      />
    );

    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText("謎解き公演")).toBeInTheDocument();
    expect(screen.getByText("場所: 新宿")).toBeInTheDocument();
  });

  it("shows a conflict warning", () => {
    render(
      <CalendarAvailabilityPanel
        connected
        selectedDate="2026-07-01"
        candidateStart="2026-07-01T10:30"
        candidateEnd="2026-07-01T11:30"
        busyRanges={busyRanges}
      />
    );

    expect(screen.getByText("Google Calendarの予定と重なっています。")).toBeInTheDocument();
  });
});
