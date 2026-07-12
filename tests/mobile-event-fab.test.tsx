import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import { MobileEventFab } from "@/components/mobile-event-fab";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

describe("MobileEventFab", () => {
  it("shows an event creation link on the events page", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    render(<MobileEventFab />);

    expect(screen.getByRole("link", { name: "イベントを作る" })).toHaveAttribute("href", "/events/new");
  });

  it("hides on the event creation page", () => {
    vi.mocked(usePathname).mockReturnValue("/events/new");

    render(<MobileEventFab />);

    expect(screen.queryByRole("link", { name: "イベントを作る" })).not.toBeInTheDocument();
  });

  it("hides on pages outside the event workflow", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");

    render(<MobileEventFab />);

    expect(screen.queryByRole("link", { name: "イベントを作る" })).not.toBeInTheDocument();
  });
});
