import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettlementPaymentMethodForm } from "@/components/settlement-payment-method-form";

describe("SettlementPaymentMethodForm", () => {
  it("labels the field as a receiving method for the receive role", () => {
    render(<SettlementPaymentMethodForm role="receive" currentValue={null} action={vi.fn()} />);

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByText("受け取り方法を保存")).toBeInTheDocument();
  });

  it("labels the field as a paying method for the pay role", () => {
    render(<SettlementPaymentMethodForm role="pay" currentValue={null} action={vi.fn()} />);

    expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
    expect(screen.getByText("支払い方法を保存")).toBeInTheDocument();
  });

  it("prefills the field with the current value", () => {
    render(<SettlementPaymentMethodForm role="pay" currentValue="PayPay" action={vi.fn()} />);

    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });
});
