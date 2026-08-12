import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { EventChat } from "@/components/event/event-chat";

const message = {
  id: "message-1",
  authorName: "あきら",
  body: "今日は18時でいい？",
  createdAt: "2026-07-13T09:00:00.000Z",
  isOwn: false
};

describe("EventChat", () => {
  it("shows messages and lets a joined member post", () => {
    render(<EventChat messages={[message]} action={vi.fn()} canPost />);

    expect(screen.getByText("今日は18時でいい？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "投稿" })).toBeEnabled();
  });

  it("shows a natural message when posting is unavailable", () => {
    render(<EventChat messages={[]} action={vi.fn()} canPost={false} unavailableReason="イベントが中止されたため、投稿できません。" />);

    expect(screen.getByText("イベントが中止されたため、投稿できません。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "投稿" })).not.toBeInTheDocument();
  });

  it("announces submit errors politely", async () => {
    const action = vi.fn().mockRejectedValue(new Error("メッセージを入力してください"));
    render(<EventChat messages={[]} action={action} canPost />);

    fireEvent.click(screen.getByRole("button", { name: "投稿" }));

    await waitFor(() => expect(screen.getByText("メッセージを入力してください")).toHaveAttribute("aria-live", "polite"));
  });

  it("passes caught errors through unstable_rethrow so framework redirects aren't swallowed", async () => {
    const redirectError = new Error("NEXT_REDIRECT;push;/login;replace;307;");
    const action = vi.fn().mockRejectedValue(redirectError);
    render(<EventChat messages={[]} action={action} canPost />);

    fireEvent.click(screen.getByRole("button", { name: "投稿" }));

    await waitFor(() => expect(unstable_rethrow).toHaveBeenCalledWith(redirectError));
  });

  it("入力欄を低くし、文字数の注記は入力が長くなるまで出さない", () => {
    render(<EventChat messages={[]} action={vi.fn()} canPost />);

    expect(screen.getByLabelText("メッセージ")).toHaveAttribute("rows", "2");
    expect(screen.queryByText("2,000文字まで")).not.toBeInTheDocument();
  });

  it("1800文字を超えたら残り文字数を目に見える形で出す", () => {
    render(<EventChat messages={[]} action={vi.fn()} canPost />);

    const textarea = screen.getByLabelText("メッセージ");
    fireEvent.change(textarea, { target: { value: "あ".repeat(1801) } });

    expect(screen.getByText("残り 199文字")).toBeInTheDocument();
  });

  /*
   * 残り文字数そのものに aria-live を付けると、1文字打つたびに読み上げが割り込む。
   * 目に見えるカウンタは毎回更新しつつ、読み上げは区切りを跨いだときだけ変える。
   */
  it("読み上げは打鍵ごとに変わらず、区切りを跨いだときだけ変わる", () => {
    render(<EventChat messages={[]} action={vi.fn()} canPost />);

    const textarea = screen.getByLabelText("メッセージ");

    fireEvent.change(textarea, { target: { value: "あ".repeat(1801) } });
    expect(screen.getByText("残り 199文字")).not.toHaveAttribute("aria-live");
    const live = screen.getByText("残り 200文字以下です");
    expect(live).toHaveAttribute("aria-live", "polite");

    // 1文字増えても読み上げ用の文言は動かない。
    fireEvent.change(textarea, { target: { value: "あ".repeat(1802) } });
    expect(screen.getByText("残り 200文字以下です")).toBeInTheDocument();

    // 区切りを跨いだら変わる。
    fireEvent.change(textarea, { target: { value: "あ".repeat(1955) } });
    expect(screen.getByText("残り 50文字以下です")).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "あ".repeat(2000) } });
    expect(screen.getByText("文字数の上限に達しました")).toBeInTheDocument();
  });
});
