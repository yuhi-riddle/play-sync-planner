import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettlementReminderCard } from "@/components/settlement-reminder-card";

describe("SettlementReminderCard", () => {
  it("allows the sent button label to match payment requests", () => {
    render(
      <SettlementReminderCard
        recipientNames={["鈴木"]}
        message="鈴木さん、支払いをお願いします。"
        reminderType="payment_request"
        markSentAction={vi.fn()}
        markSentLabel="依頼済みに記録"
      />
    );

    expect(screen.getByRole("button", { name: "依頼済みに記録" })).toBeInTheDocument();
  });

  it("keeps the reminder type in a hidden field", () => {
    render(
      <SettlementReminderCard
        recipientNames={["Alice"]}
        message="Please pay."
        markSentAction={vi.fn()}
        reminderType="payment_request"
      />
    );

    expect(document.querySelector('input[name="reminder_type"]')).toHaveAttribute("value", "payment_request");
  });

  it("allows a custom empty message", () => {
    render(
      <SettlementReminderCard
        recipientNames={[]}
        message=""
        reminderType="confirmation_request"
        markSentAction={vi.fn()}
        emptyText="確認待ちはありません。"
      />
    );

    expect(screen.getByText("確認待ちはありません。")).toBeInTheDocument();
  });
});
