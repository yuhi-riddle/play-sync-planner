import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicSettlementSummary } from "@/components/public-settlement-summary";

describe("PublicSettlementSummary", () => {
  it("shows expenses and remaining payment requests for participants", () => {
    render(
      <PublicSettlementSummary
        eventTitle="7月の謎解き会"
        planTitle="土曜午後"
        expenses={[
          {
            id: "expense-1",
            title: "チケット代",
            amount: 7200,
            payerName: "鈴木",
            memo: "予約番号 ABC-123",
            isImportant: true
          }
        ]}
        settlements={[
          {
            id: "settlement-1",
            fromName: "田中",
            toName: "鈴木",
            amount: 3600,
            paymentMethod: "PayPay",
            paymentUrl: "https://example.com/pay/suzuki",
            memo: "送金後に連絡ください",
            payments: [{ amount: 1000, confirmedAt: null }]
          }
        ]}
      />
    );

    expect(screen.getByText("7月の謎解き会")).toBeInTheDocument();
    expect(screen.getByText("土曜午後")).toBeInTheDocument();
    expect(screen.getByText("チケット代")).toBeInTheDocument();
    expect(screen.getByText("予約番号 ABC-123")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && element?.textContent === "田中 → 鈴木")
    ).toBeInTheDocument();
    expect(screen.getByText("矢印の左が支払う人、右が受け取る人です。自分の名前の行から支払ってください。")).toBeInTheDocument();
    expect(screen.getByText("残り 2,600円")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "清算の進捗" })).toBeInTheDocument();
    expect(screen.getByText("受け取り確認待ち").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("外部決済ページを開いて支払えます")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PayPayで支払う" })).toHaveAttribute("href", "https://example.com/pay/suzuki");
  });

  it("shows a payment record form when an action is provided", () => {
    render(
      <PublicSettlementSummary
        eventTitle="7月の謎解き会"
        planTitle={null}
        expenses={[]}
        settlements={[
          {
            id: "settlement-1",
            fromName: "田中",
            toName: "鈴木",
            amount: 3600,
            paymentMethod: null,
            paymentUrl: null,
            memo: null,
            payments: [{ amount: 1000, confirmedAt: null }]
          }
        ]}
        recordPaymentAction={() => undefined}
      />
    );

    const paymentRecordLabels = screen.getAllByText("支払いを記録");
    expect(paymentRecordLabels.length).toBeGreaterThan(0);
    expect(screen.getByRole("spinbutton", { name: /支払い金額/ })).toHaveValue(2600);
    expect(
      screen.getByText((_, element) => element?.textContent === "一部だけ支払った場合は、支払った金額に変更できます。残り 2,600円です。")
    ).toBeInTheDocument();
    expect(paymentRecordLabels[0]?.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "支払いを記録" })).toBeInTheDocument();
  });
});
