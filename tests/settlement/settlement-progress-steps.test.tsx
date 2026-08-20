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
    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByText("支払い待ち")).toBeInTheDocument();
    expect(screen.getByText("（2件）")).toBeInTheDocument();
    expect(screen.getByText("参加者の支払いを待っています。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("shows the confirmation step once payments are done", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={0}
        confirmationWaitingCount={2}
        isComplete={false}
      />
    );

    expect(screen.getByText("STEP 2")).toBeInTheDocument();
    expect(screen.getByText("受け取り確認待ち")).toBeInTheDocument();
    expect(screen.getByText("主催者の受け取り確認待ちです。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("keeps the payment step current when confirmation waiting also exists", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={1}
        confirmationWaitingCount={2}
        isComplete={false}
      />
    );

    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByText("支払い待ち")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(items[1]).not.toHaveAttribute("aria-current");
  });

  it("marks the flow complete when nothing remains", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={0}
        confirmationWaitingCount={0}
        isComplete
      />
    );

    expect(screen.getByText("STEP 3")).toBeInTheDocument();
    expect(screen.getByText("（3/3）")).toBeInTheDocument();
    expect(screen.getByText("すべての支払い確認が終わっています。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });
});
