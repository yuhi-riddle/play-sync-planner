import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginConsentForm } from "@/components/login-consent-form";

function elements() {
  return {
    submit: screen.getByRole("button", { name: "Google でログイン" }),
    termsLink: screen.getByRole("link", { name: /利用規約を読む/ }),
    privacyLink: screen.getByRole("link", { name: /プライバシーポリシーを読む/ }),
    termsBox: screen.getByRole("checkbox", { name: "利用規約に同意する" }),
    privacyBox: screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" })
  };
}

describe("LoginConsentForm", () => {
  it("書面を開くまでチェックできない（開いてもいない書面への同意は同意ではない）", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsLink, termsBox, privacyBox } = elements();

    expect(termsBox).toBeDisabled();
    expect(privacyBox).toBeDisabled();
    expect(submit).toBeDisabled();

    // 利用規約を開いた行だけが操作できるようになる
    fireEvent.click(termsLink);
    expect(termsBox).toBeEnabled();
    expect(privacyBox).toBeDisabled();
  });

  it("中央クリックで書面を開いた場合もチェックできる", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsLink, termsBox } = elements();

    fireEvent(termsLink, new MouseEvent("auxclick", { bubbles: true, button: 1 }));

    expect(termsBox).toBeEnabled();
  });

  it("右クリックから書面を開く場合も同意欄を操作できる", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsLink, termsBox } = elements();

    fireEvent.contextMenu(termsLink);

    expect(termsBox).toBeEnabled();
  });

  it("書面リンクの次に大きな同意操作へ進める", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsLink, termsBox } = elements();

    const position = termsLink.compareDocumentPosition(termsBox);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(termsBox.closest("label")).toHaveClass("min-h-11");
  });

  it("両方を開いて同意するまでログインできない", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsLink, privacyLink, termsBox, privacyBox } = elements();

    fireEvent.click(termsLink);
    fireEvent.click(termsBox);
    expect(submit).toBeDisabled();

    fireEvent.click(privacyLink);
    fireEvent.click(privacyBox);
    expect(submit).toBeEnabled();
  });

  it("規約は別タブで開く（この画面から離脱しないので、チェック状態を保存せずに済む）", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsLink, privacyLink } = elements();

    expect(termsLink).toHaveAttribute("href", "/terms?from=login");
    expect(privacyLink).toHaveAttribute("href", "/privacy?from=login");
    expect(termsLink).toHaveAttribute("target", "_blank");
    expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  it("同意チェックを保存しない（再表示のたびに未チェック・未開封から始まる）", () => {
    const { unmount } = render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    const first = elements();
    fireEvent.click(first.termsLink);
    fireEvent.click(first.termsBox);
    fireEvent.click(first.privacyLink);
    fireEvent.click(first.privacyBox);
    expect(first.submit).toBeEnabled();

    unmount();
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    const second = elements();
    expect(second.termsBox).not.toBeChecked();
    expect(second.privacyBox).not.toBeChecked();
    expect(second.termsBox).toBeDisabled();
    expect(second.privacyBox).toBeDisabled();
    expect(second.submit).toBeDisabled();
  });
});
