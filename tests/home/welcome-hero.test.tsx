import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WelcomeHero } from "@/components/home/welcome-hero";

describe("WelcomeHero", () => {
  /*
   * 認証は Google だけ。「はじめる」と「ログイン」に割っても行き先は同じ /login なので、
   * 押し分けを迷わせるだけになる。入口は1つに保つ。
   */
  it("入口のボタンは1つで、ログイン画面へ送る", () => {
    render(<WelcomeHero />);

    const start = screen.getByRole("link", { name: "Google ではじめる" });
    expect(start).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "ログイン" })).not.toBeInTheDocument();
  });

  /*
   * 同意はログイン画面のチェックボックスで取る（本文を開くまでチェックできない作り）。
   * ここで「続けると同意したことになります」と書くと、その証跡より弱い形を先に見せてしまう。
   */
  it("この画面では同意を取ったことにしない", () => {
    render(<WelcomeHero />);

    expect(screen.getByText(/次の画面で利用規約とプライバシーポリシーを確認します/)).toBeInTheDocument();
    expect(screen.queryByText(/同意したことになります/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("規約とプライバシーポリシーはログイン前でも読める", () => {
    render(<WelcomeHero />);

    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute("href", "/privacy");
  });

  // 背景の円はただの飾り。読み上げに出すと意味のない要素を読ませることになる。
  it("背景の飾りは読み上げに出さない", () => {
    const { container } = render(<WelcomeHero />);

    const decorations = container.querySelectorAll('[aria-hidden="true"]');
    expect(decorations.length).toBeGreaterThanOrEqual(2);
  });
});
