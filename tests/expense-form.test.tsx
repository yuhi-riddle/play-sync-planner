import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "@/components/expense-form";

describe("ExpenseForm", () => {
  it("does not render a payment method field", () => {
    render(
      <ExpenseForm
        participants={[{ id: "p1", displayName: "田中" }]}
        action={vi.fn()}
      />
    );

    expect(screen.queryByText("支払い方法")).not.toBeInTheDocument();
  });
});
