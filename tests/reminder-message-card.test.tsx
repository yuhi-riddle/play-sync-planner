import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReminderMessageCard } from "@/components/reminder-message-card";

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

  it("shows an empty state when everyone has answered", () => {
    render(<ReminderMessageCard pendingNames={[]} message={null} shareUrl="https://example.com/s/token/answer" />);

    expect(screen.getByText("未回答者はいません。")).toBeInTheDocument();
  });
});
