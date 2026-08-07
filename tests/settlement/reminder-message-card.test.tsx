import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReminderMessageCard } from "@/components/settlement/reminder-message-card";

describe("ReminderMessageCard", () => {
  it("shows pending participants and copies the reminder message", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText }
    });

    render(
      <ReminderMessageCard
        pendingNames={["鈴木", "田中"]}
        message={"鈴木さん、田中さん\n\n回答をお願いします。"}
        shareUrl="https://example.com/s/token/answer"
      />
    );

    expect(screen.getByText("鈴木")).toBeInTheDocument();
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(screen.getByLabelText("リマインド文面")).toHaveValue("鈴木さん、田中さん\n\n回答をお願いします。");

    fireEvent.click(screen.getByRole("button", { name: "文面をコピー" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("鈴木さん、田中さん\n\n回答をお願いします。");
    });
    expect(screen.getByRole("button", { name: "コピーしました" })).toBeInTheDocument();
  });

  it("shows reminder history and a mark-as-sent form", () => {
    render(
      <ReminderMessageCard
        pendingNames={["鈴木", "田中"]}
        message={"鈴木さん、田中さん\n\n回答をお願いします。"}
        shareUrl="https://example.com/s/token/answer"
        markSentAction={vi.fn()}
        latestSentAt="2026-07-01T12:00:00+09:00"
        sentCount={2}
      />
    );

    expect(screen.getByText(/前回:/)).toBeInTheDocument();
    expect(screen.getByText("記録済み 2回")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送信済みに記録" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送信済みに記録" })).toHaveClass("w-full");
    expect(document.querySelector('input[name="recipient_names"]')).toHaveAttribute("value", "鈴木\n田中");
    expect(document.querySelector('input[name="reminder_message"]')).toHaveAttribute("value", "鈴木さん、田中さん\n\n回答をお願いします。");
  });

  it("shows an empty state when everyone has answered", () => {
    render(<ReminderMessageCard pendingNames={[]} message={null} shareUrl="https://example.com/s/token/answer" />);

    expect(screen.getByText("未回答者はいません。")).toBeInTheDocument();
  });
});
