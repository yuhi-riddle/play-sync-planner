import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIconBadge } from "@/components/event/category-icon-badge";

describe("CategoryIconBadge", () => {
  it("uses the category's background color class and renders an icon", () => {
    const { container } = render(<CategoryIconBadge category="travel" />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.className).toContain("bg-category-travel");
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the neutral/other styling for an unknown category", () => {
    const { container } = render(<CategoryIconBadge category="not-a-real-category" />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.className).toContain("bg-subtle");
  });
});
