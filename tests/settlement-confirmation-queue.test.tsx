import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettlementConfirmationQueue } from "@/components/settlement-confirmation-queue";

describe("SettlementConfirmationQueue", () => {
  it("shows pending payment records with a confirmation action", () => {
    render(
      <SettlementConfirmationQueue
        items={[
          {
            id: "payment-1",
            fromName: "田中",
            toName: "鈴木",
            amount: 2600,
            paidAt: "2026-07-02T10:00:00+09:00",
            paymentMethod: "PayPay",
            paymentUrl: "https://example.com/pay/receipt",
            memo: "半分だけ先に支払い"
          }
        ]}
        confirmPaymentAction={() => undefined}
      />
    );

    expect(screen.getByRole("heading", { name: "受け取り確認待ち" })).toBeInTheDocument();
    expect(screen.getByText("田中さんから鈴木さんへ 2,600円 の支払い記録があります。")).toBeInTheDocument();
    expect(screen.getByText("PayPay / 半分だけ先に支払い")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "支払い記録を開く" })).toHaveAttribute("href", "https://example.com/pay/receipt");
    expect(screen.getByRole("button", { name: "受け取り確認する" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no pending confirmations", () => {
    render(<SettlementConfirmationQueue items={[]} confirmPaymentAction={() => undefined} />);

    expect(screen.getByText("受け取り確認待ちはありません。")).toBeInTheDocument();
  });
});
