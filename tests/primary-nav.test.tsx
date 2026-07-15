import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrimaryNav } from "@/components/primary-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname
}));

describe("PrimaryNav", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("shows the four primary destinations as icon buttons in a responsive grid", () => {
    render(<PrimaryNav />);

    const nav = screen.getByRole("navigation", { name: "主要な画面" });
    expect(nav).toHaveClass("grid", "grid-cols-2", "sm:grid-cols-4");

    const destinations = [
      ["ホーム", "/"],
      ["イベント", "/events"],
      ["カレンダー", "/plans"],
      ["つながり", "/connections"]
    ] as const;

    for (const [name, href] of destinations) {
      const link = within(nav).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("min-h-11", "rounded-control", "border");
      expect(link.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("marks the current destination with the Madoi selected-state tokens", () => {
    navigation.pathname = "/connections";
    render(<PrimaryNav />);

    const current = screen.getByRole("link", { name: "つながり" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-mist", "border-moss", "text-pine");
  });

  it("hides the primary navigation during profile onboarding", () => {
    navigation.pathname = "/onboarding/profile";
    render(<PrimaryNav />);

    expect(screen.queryByRole("navigation", { name: "主要な画面" })).not.toBeInTheDocument();
  });
});
