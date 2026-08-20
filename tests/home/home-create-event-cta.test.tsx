import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeCreateEventCta } from "@/components/home/home-create-event-cta";

describe("HomeCreateEventCta", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("links to /events/new by default", () => {
    render(<HomeCreateEventCta />);

    const link = screen.getByRole("link", { name: /イベントを作成する/ });
    expect(link).toHaveAttribute("href", "/events/new");
  });

  it("shows the supporting subtext", () => {
    render(<HomeCreateEventCta />);

    expect(screen.getByText("新しい予定をみんなで調整しましょう")).toBeInTheDocument();
  });
});
