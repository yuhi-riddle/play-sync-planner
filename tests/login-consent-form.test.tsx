import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginConsentForm } from "@/components/login-consent-form";

describe("LoginConsentForm", () => {
  it("keeps Google sign-in unavailable until both legal documents are accepted", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    const submit = screen.getByRole("button", { name: "Google でログイン" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("link", { name: "利用規約を読む" })).toHaveAttribute("href", "/terms?from=login");
    expect(screen.getByRole("link", { name: "プライバシーポリシーを読む" })).toHaveAttribute("href", "/privacy?from=login");

    fireEvent.click(screen.getByRole("checkbox", { name: "利用規約に同意する" }));
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" }));
    expect(submit).toBeEnabled();
  });
});
