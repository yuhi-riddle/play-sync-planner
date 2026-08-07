import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LegalModal } from "@/components/legal/legal-modal";

const sections = [
  { title: "1. 適用", body: "この利用規約は、Madoi を利用するすべての方に適用されます。" },
  { title: "2. アカウント", body: "Madoi の利用には Google アカウントでのログインが必要です。" }
];

function renderModal(onClose = vi.fn()) {
  render(<LegalModal title="利用規約" sections={sections} pageHref="/terms" onClose={onClose} />);
  return onClose;
}

describe("LegalModal", () => {
  it("表題と本文を出す", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "利用規約" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. 適用" })).toBeInTheDocument();
  });

  it("支援技術に表題を伝える", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toBe("利用規約");
  });

  it("開いた直後は閉じるボタンにフォーカスが当たる", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  });

  it("Escapeで閉じる", () => {
    const onClose = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタンで閉じる", () => {
    const onClose = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // モーダルにするとリンクの中央クリック・右クリックで別タブに開く道が失われるため、
  // ページへの導線を内側に残す。
  it("ページで開く導線を持つ", () => {
    renderModal();

    expect(screen.getByRole("link", { name: "ページで開く" })).toHaveAttribute("href", "/terms");
  });

  it("本文が長いときに内側でスクロールできる", () => {
    const { container } = render(
      <LegalModal title="利用規約" sections={sections} pageHref="/terms" onClose={vi.fn()} />
    );

    expect(container.querySelector(".overflow-y-auto")).toBeInTheDocument();
  });
});
