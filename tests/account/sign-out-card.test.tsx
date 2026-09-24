import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
vi.mock("@/lib/actions/account/auth", () => ({ signOutAction: vi.fn() }));

import { SignOutCard } from "@/components/account/sign-out-card";

describe("SignOutCard", () => {
  it("offers sign-out as a submit button inside a form", () => {
    render(<SignOutCard />);

    expect(screen.getByRole("heading", { name: "ログアウト" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "ログアウト" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
    expect(button).toHaveClass("min-h-11", "focus:ring-2", "focus:ring-clay");
  });
});
