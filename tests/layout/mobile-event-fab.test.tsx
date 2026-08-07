import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import { MobileEventFab } from "@/components/layout/mobile-event-fab";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

describe("MobileEventFab", () => {
  it("shows an event creation link positioned above the fixed bottom navigation", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    render(<MobileEventFab isSignedIn />);

    const createEventLink = screen.getByRole("link", { name: "イベント作成" });
    expect(createEventLink).toHaveAttribute("href", "/events/new");
    expect(createEventLink).toHaveClass("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
  });

  it("keeps visible hover and keyboard focus states", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    render(<MobileEventFab isSignedIn />);

    expect(screen.getByRole("link", { name: "イベント作成" })).toHaveClass(
      "transition-colors",
      "hover:bg-pine",
      "focus:outline-none",
      "focus:ring-2",
      "focus:ring-clay",
      "focus:ring-offset-2"
    );
  });

  it("hides on the event creation page", () => {
    vi.mocked(usePathname).mockReturnValue("/events/new");

    render(<MobileEventFab isSignedIn />);

    expect(screen.queryByRole("link", { name: "イベント作成" })).not.toBeInTheDocument();
  });

  it("hides on pages outside the event workflow", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");

    render(<MobileEventFab isSignedIn />);

    expect(screen.queryByRole("link", { name: "イベント作成" })).not.toBeInTheDocument();
  });

  it("hides when the visitor is signed out", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    render(<MobileEventFab isSignedIn={false} />);

    expect(screen.queryByRole("link", { name: "イベント作成" })).not.toBeInTheDocument();
  });
});
