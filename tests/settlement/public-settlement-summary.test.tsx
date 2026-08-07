import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicSettlementSummary } from "@/components/settlement/public-settlement-summary";

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
            fromParticipantId: "p1",
            toParticipantId: "p2",
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
            fromParticipantId: "p1",
            toParticipantId: "p2",
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

  it("emphasizes the remaining settlement amount over the other summary stats", () => {
    render(
      <PublicSettlementSummary
        eventTitle="7月の謎解き会"
        planTitle={null}
        expenses={[
          { id: "expense-1", title: "チケット代", amount: 7200, payerName: "鈴木", memo: null, isImportant: false },
          { id: "expense-2", title: "送料", amount: 100, payerName: "鈴木", memo: null, isImportant: false }
        ]}
        settlements={[
          {
            id: "settlement-1",
            fromParticipantId: "p1",
            toParticipantId: "p2",
            fromName: "A",
            toName: "B",
            amount: 3600,
            paymentMethod: null,
            paymentUrl: null,
            memo: null,
            payments: []
          },
          {
            id: "settlement-2",
            fromParticipantId: "p3",
            toParticipantId: "p4",
            fromName: "C",
            toName: "D",
            amount: 1000,
            paymentMethod: null,
            paymentUrl: null,
            memo: null,
            payments: []
          }
        ]}
      />
    );

    expect(screen.getByText("4,600円").className).toMatch(/text-\[2\.5rem\]/);
    expect(screen.getByText("0円").className).not.toMatch(/text-\[2\.5rem\]/);
    expect(screen.getByText("7,300円").className).not.toMatch(/text-\[2\.5rem\]/);
  });

  it("shows a settlement complete badge only when nothing remains", () => {
    const { rerender } = render(
      <PublicSettlementSummary
        eventTitle="7月の謎解き会"
        planTitle={null}
        expenses={[]}
        settlements={[
          {
            id: "settlement-1",
            fromParticipantId: "p1",
            toParticipantId: "p2",
            fromName: "A",
            toName: "B",
            amount: 1000,
            paymentMethod: null,
            paymentUrl: null,
            memo: null,
            payments: [{ amount: 1000, confirmedAt: "2026-01-01T00:00:00Z" }]
          }
        ]}
      />
    );
    expect(screen.getByText("清算完了")).toBeInTheDocument();

    rerender(
      <PublicSettlementSummary
        eventTitle="7月の謎解き会"
        planTitle={null}
        expenses={[]}
        settlements={[
          {
            id: "settlement-1",
            fromParticipantId: "p1",
            toParticipantId: "p2",
            fromName: "A",
            toName: "B",
            amount: 1000,
            paymentMethod: null,
            paymentUrl: null,
            memo: null,
            payments: []
          }
        ]}
      />
    );
    expect(screen.queryByText("清算完了")).not.toBeInTheDocument();
  });

  describe("payment method viewer block", () => {
    const settlements = [
      {
        id: "settlement-1",
        fromParticipantId: "p2",
        toParticipantId: "p1",
        fromName: "鈴木",
        toName: "田中",
        amount: 2000,
        paymentMethod: null,
        paymentUrl: null,
        memo: null,
        payments: []
      }
    ];

    it("shows the settlement payment method form for the resolved viewer", () => {
      render(
        <PublicSettlementSummary
          eventTitle="夏祭り"
          planTitle={null}
          expenses={[]}
          settlements={settlements}
          viewer={{ role: "pay", currentValue: null, action: vi.fn() }}
        />
      );

      expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
    });
  });
});
