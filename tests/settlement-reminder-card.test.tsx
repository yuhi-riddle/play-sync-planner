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
        markSentAction={vi.fn()}
        markSentLabel="依頼済みに記録"
      />
    );

    expect(screen.getByRole("button", { name: "依頼済みに記録" })).toBeInTheDocument();
  });

  it("allows a custom empty message", () => {
    render(
      <SettlementReminderCard
        recipientNames={[]}
        message=""
        markSentAction={vi.fn()}
        emptyText="確認待ちはありません。"
      />
    );

    expect(screen.getByText("確認待ちはありません。")).toBeInTheDocument();
  });
});
