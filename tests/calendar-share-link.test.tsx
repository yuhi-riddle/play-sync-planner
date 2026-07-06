import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarShareLink } from "@/components/calendar-share-link";

describe("CalendarShareLink", () => {
  it("announces that Google Calendar opens in a new tab", () => {
    render(<CalendarShareLink href="https://calendar.google.com/calendar/render?action=TEMPLATE" />);

    const link = screen.getByRole("link", { name: "Google Calendarに追加 新しいタブで開きます" });

    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
