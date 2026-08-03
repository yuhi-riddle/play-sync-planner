import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn()
}));

import { unstable_rethrow } from "next/navigation";

import { EventChat } from "@/components/event-chat";

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
});
