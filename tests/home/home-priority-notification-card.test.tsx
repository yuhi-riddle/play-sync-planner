import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePriorityNotificationCard } from "@/components/home/home-priority-notification-card";

describe("HomePriorityNotificationCard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("renders nothing when count is 0", () => {
    const { container } = render(<HomePriorityNotificationCard count={0} title="" href="/notifications" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count and the priority notification title", () => {
    render(<HomePriorityNotificationCard count={3} title="支払い待ちがあります" href="/notifications" />);

    expect(screen.getByText("3件")).toBeInTheDocument();
    expect(screen.getByText("支払い待ちがあります")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/notifications");
  });
});
