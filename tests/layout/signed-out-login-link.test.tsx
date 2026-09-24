import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import { SignedOutLoginLink } from "@/components/layout/signed-out-login-link";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

describe("SignedOutLoginLink", () => {
  // 最初の画面には「Madoiをはじめる」があり、行き先は同じ /login。ログイン画面では自分自身へのリンクになる。
  it.each(["/", "/login"])("does not repeat the login entry on %s", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    const { container } = render(<SignedOutLoginLink />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each(["/terms", "/privacy", "/invites/token"])("offers the login entry on %s", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<SignedOutLoginLink />);

    const link = screen.getByRole("link", { name: "ログイン" });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveClass("min-h-11", "focus:ring-2", "focus:ring-clay");
  });
});
