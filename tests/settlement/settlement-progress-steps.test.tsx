import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettlementProgressSteps } from "@/components/settlement/settlement-progress-steps";

describe("SettlementProgressSteps", () => {
  it("shows the current settlement step while payments are waiting", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={2}
        confirmationWaitingCount={0}
        isComplete={false}
      />
    );

    expect(screen.getByRole("list", { name: "清算の進捗" })).toBeInTheDocument();
    expect(screen.getByText("支払い待ち")).toBeInTheDocument();
    expect(screen.getByText("2件")).toBeInTheDocument();
    expect(screen.getByText("参加者の支払いを待っています。")).toBeInTheDocument();
    expect(screen.getByText("支払い待ち").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("marks the flow complete when nothing remains", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={0}
        confirmationWaitingCount={0}
        isComplete
      />
    );

    expect(screen.getByText("完了")).toBeInTheDocument();
    expect(screen.getByText("すべての支払い確認が終わっています。")).toBeInTheDocument();
    expect(screen.getByText("完了").closest("li")).toHaveAttribute("aria-current", "step");
  });
});
