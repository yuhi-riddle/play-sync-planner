import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrimaryNav } from "@/components/layout/primary-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname
}));

describe("PrimaryNav", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("shows the five primary destinations as icon buttons in a fixed mobile bar and a static desktop row", () => {
    render(<PrimaryNav isSignedIn />);

    const nav = screen.getByRole("navigation", { name: "主要な画面" });
    expect(nav).toHaveClass("fixed", "bottom-0", "grid-cols-5", "sm:static", "sm:grid-cols-5");

    const destinations = [
      ["ホーム", "/"],
      ["イベント", "/events"],
      ["カレンダー", "/plans"],
      ["つながり", "/connections"],
      ["通知", "/notifications"]
    ] as const;

    for (const [name, href] of destinations) {
      const link = within(nav).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("min-h-14", "rounded-control", "sm:min-h-11", "sm:border");
      expect(link.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("marks the current destination with the Madoi selected-state tokens", () => {
    navigation.pathname = "/connections";
    render(<PrimaryNav isSignedIn />);

    const current = screen.getByRole("link", { name: "つながり" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-mist", "border-moss", "text-pine");
  });

  it("hides the primary navigation during profile onboarding", () => {
    navigation.pathname = "/onboarding/profile";
    render(<PrimaryNav isSignedIn />);

    expect(screen.queryByRole("navigation", { name: "主要な画面" })).not.toBeInTheDocument();
  });

  it("hides the primary navigation when the visitor is signed out", () => {
    render(<PrimaryNav isSignedIn={false} />);

    expect(screen.queryByRole("navigation", { name: "主要な画面" })).not.toBeInTheDocument();
  });

  it("puts the unread count on the notifications destination", () => {
    render(<PrimaryNav isSignedIn unreadCount={3} />);

    const link = screen.getByRole("link", { name: "通知 未読3件" });
    expect(link).toHaveAttribute("href", "/notifications");
    expect(within(link).getByText("3")).toHaveClass("bg-clay-ink", "text-white");
  });

  it("caps the badge at 99+ while the accessible name keeps the exact count", () => {
    render(<PrimaryNav isSignedIn unreadCount={150} />);

    const link = screen.getByRole("link", { name: "通知 未読150件" });
    expect(within(link).getByText("99+")).toBeInTheDocument();
  });

  it("shows no badge when everything is read", () => {
    render(<PrimaryNav isSignedIn unreadCount={0} />);

    const link = screen.getByRole("link", { name: "通知" });
    expect(link.querySelector(".bg-clay-ink")).not.toBeInTheDocument();
  });

  it("marks notifications as the current destination on the notifications page", () => {
    navigation.pathname = "/notifications";
    render(<PrimaryNav isSignedIn />);

    expect(screen.getByRole("link", { name: "通知" })).toHaveAttribute("aria-current", "page");
  });
});
