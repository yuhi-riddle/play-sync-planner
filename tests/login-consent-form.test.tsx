import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginConsentForm } from "@/components/login-consent-form";

function elements() {
  return {
    submit: screen.getByRole("button", { name: "Google でログイン" }),
    termsButton: screen.getByRole("button", { name: "利用規約を読む" }),
    privacyButton: screen.getByRole("button", { name: "プライバシーポリシーを読む" }),
    termsBox: screen.getByRole("checkbox", { name: "利用規約に同意する" }),
    privacyBox: screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" })
  };
}

describe("LoginConsentForm", () => {
  it("書面を開くまでチェックできない（開いてもいない書面への同意は同意ではない）", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsButton, termsBox, privacyBox } = elements();

    expect(termsBox).toBeDisabled();
    expect(privacyBox).toBeDisabled();
    expect(submit).toBeDisabled();

    fireEvent.click(termsButton);

    expect(termsBox).toBeEnabled();
    expect(privacyBox).toBeDisabled();
  });

  it("書面を開くとモーダルが出る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    fireEvent.click(elements().termsButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "利用規約" })).toBeInTheDocument();
  });

  it("モーダルを閉じると、開いたボタンにフォーカスが戻る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(termsButton).toHaveFocus();
  });

  it("モーダルを閉じてもチェック状態は残る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton, termsBox } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(termsBox);
    expect(termsBox).toBeChecked();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(termsBox).toBeChecked();
  });

  it("書面を開くボタンの次に大きな同意操作へ進める", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton, termsBox } = elements();

    const position = termsButton.compareDocumentPosition(termsBox);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(termsBox.closest("label")).toHaveClass("min-h-11");
  });

  it("両方を開いて同意するまでログインできない", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsButton, privacyButton, termsBox, privacyBox } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(termsBox);
    expect(submit).toBeDisabled();

    fireEvent.click(privacyButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(privacyBox);

    expect(submit).toBeEnabled();
  });

  // 画面遷移が無くなったので、往復のあいだ状態を持ち越す仕組みは要らなくなった。
  it("sessionStorage を使わない", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    fireEvent.click(elements().termsButton);

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
