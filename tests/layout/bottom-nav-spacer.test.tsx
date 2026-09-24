import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import { BottomNavSpacer } from "@/components/layout/bottom-nav-spacer";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

describe("BottomNavSpacer", () => {
  it("reserves mobile-only room under the footer where the fixed navigation is shown", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    const { container } = render(<BottomNavSpacer isSignedIn />);

    const spacer = container.querySelector('[data-testid="bottom-nav-spacer"]');
    expect(spacer).toHaveClass("h-36", "sm:hidden");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["/events/new", "/s/token/answer"])("renders nothing on %s, where the navigation is hidden", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    const { container } = render(<BottomNavSpacer isSignedIn />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for signed-out visitors", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    const { container } = render(<BottomNavSpacer isSignedIn={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
