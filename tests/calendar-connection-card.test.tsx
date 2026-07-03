import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarConnectionCard } from "@/components/calendar-connection-card";

describe("CalendarConnectionCard", () => {
  it("shows a connect link when disconnected", () => {
    render(<CalendarConnectionCard connected={false} accountEmail={null} updatedAt={null} />);

    expect(screen.getByText("未連携")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Calendarを連携" })).toHaveAttribute("href", "/api/google-calendar/connect");
  });

  it("shows connected account and disconnect button", () => {
    render(<CalendarConnectionCard connected accountEmail="me@example.com" updatedAt="2026-06-29T10:00:00+09:00" canWriteEvents />);

    expect(screen.getByText("連携済み")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "連携を解除" })).toBeInTheDocument();
  });

  it("shows an error message", () => {
    render(<CalendarConnectionCard connected={false} accountEmail={null} updatedAt={null} status="error" />);

    expect(screen.getByText("Google Calendarと接続できませんでした。もう一度試してください。")).toBeInTheDocument();
  });

  it("asks for reconnection when the existing scope cannot create calendar events", () => {
    render(
      <CalendarConnectionCard
        connected
        accountEmail="me@example.com"
        updatedAt="2026-06-29T10:00:00+09:00"
        canWriteEvents={false}
      />
    );

    expect(screen.getByText("今の連携は予定の読み取り専用です。確定した日程をGoogle Calendarへ登録するには、再連携してください。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "再連携する" })).toHaveAttribute("href", "/api/google-calendar/connect");
  });
});
