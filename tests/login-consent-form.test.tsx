import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginConsentForm } from "@/components/login-consent-form";

describe("LoginConsentForm", () => {
  it("keeps Google sign-in unavailable until both legal documents are accepted", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    const submit = screen.getByRole("button", { name: "Google でログイン" });
    expect(submit).toBeDisabled();

    const termsLink = screen.getByRole("link", { name: /利用規約を読む/ });
    const privacyLink = screen.getByRole("link", { name: /プライバシーポリシーを読む/ });
    expect(termsLink).toHaveAttribute("href", "/terms?from=login");
    expect(privacyLink).toHaveAttribute("href", "/privacy?from=login");

    // 規約は別タブで開く。この画面から離脱しないので、チェック状態を保存せずに済む
    expect(termsLink).toHaveAttribute("target", "_blank");
    expect(privacyLink).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("checkbox", { name: "利用規約に同意する" }));
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" }));
    expect(submit).toBeEnabled();
  });

  it("同意チェックを保存しない（再表示のたびに未チェックから始まる）", () => {
    const { unmount } = render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    fireEvent.click(screen.getByRole("checkbox", { name: "利用規約に同意する" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" }));
    expect(screen.getByRole("button", { name: "Google でログイン" })).toBeEnabled();

    unmount();
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    expect(screen.getByRole("checkbox", { name: "利用規約に同意する" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Google でログイン" })).toBeDisabled();
  });
});
