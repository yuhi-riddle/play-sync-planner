import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn() }));

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus };
});

import { SubmitButton } from "@/components/ui/client";

describe("SubmitButton", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    useFormStatus.mockReturnValue({ pending: false });
  });

  it("通常時は押せる状態で、渡した文言を表示する", () => {
    render(<SubmitButton>送信する</SubmitButton>);

    const button = screen.getByRole("button", { name: "送信する" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("送信中はボタンを無効化し、連打で二重送信できないようにする", () => {
    useFormStatus.mockReturnValue({ pending: true });

    render(<SubmitButton>送信する</SubmitButton>);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("送信中の文言を指定できる", () => {
    useFormStatus.mockReturnValue({ pending: true });

    render(<SubmitButton pendingChildren="送信中…">送信する</SubmitButton>);

    expect(screen.getByRole("button")).toHaveTextContent("送信中…");
  });

  it("文言指定が無いときは送信中も元のラベルのままにする", () => {
    useFormStatus.mockReturnValue({ pending: true });

    render(<SubmitButton>送信する</SubmitButton>);

    expect(screen.getByRole("button")).toHaveTextContent("送信する");
  });

  it("secondaryバリアントは枠線ボタンのクラスになる", () => {
    render(<SubmitButton variant="secondary">キャンセル</SubmitButton>);

    expect(screen.getByRole("button").className).toContain("border-line-strong");
  });

  it("アイコンを付けられる", () => {
    render(
      <SubmitButton icon={<span data-testid="submit-icon" />}>登録する</SubmitButton>
    );

    expect(screen.getByTestId("submit-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登録する" })).toBeInTheDocument();
  });

  it("classNameで幅などのレイアウト調整を追加できる", () => {
    render(<SubmitButton className="w-full sm:w-auto">送信する</SubmitButton>);

    const className = screen.getByRole("button").className;
    expect(className).toContain("w-full");
    expect(className).toContain("sm:w-auto");
    expect(className).toContain("bg-ink");
  });

  it("refを転送できる(確認ステップでのフォーカス移動に使う)", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<SubmitButton ref={ref}>確定する</SubmitButton>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe("確定する");
  });
});
