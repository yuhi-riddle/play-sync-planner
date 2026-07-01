import { describe, expect, it } from "vitest";

import { summarizeReminderLogs, summarizeSettlementReminderLogs } from "@/lib/domain/reminder-log";

describe("summarizeReminderLogs", () => {
  it("returns the latest sent time and total count", () => {
    expect(
      summarizeReminderLogs([
        { sent_at: "2026-07-01T10:00:00+09:00" },
        { sent_at: "2026-07-02T10:00:00+09:00" }
      ])
    ).toEqual({
      latestSentAt: "2026-07-02T10:00:00+09:00",
      totalCount: 2
    });
  });

  it("returns an empty summary when there are no logs", () => {
    expect(summarizeReminderLogs([])).toEqual({
      latestSentAt: null,
      totalCount: 0
    });
  });
});

describe("summarizeSettlementReminderLogs", () => {
  it("separates payment requests and confirmation requests", () => {
    expect(
      summarizeSettlementReminderLogs([
        {
          sent_at: "2026-07-03T10:00:00+09:00",
          recipient_names: ["田中"],
          reminder_message: "清算のお願いです。\n田中さんへ 1,000円 の支払いをお願いします。"
        },
        {
          sent_at: "2026-07-04T10:00:00+09:00",
          recipient_names: ["鈴木"],
          reminder_message: "受け取り確認のお願いです。\n田中さんから 1,000円 の支払い記録があります。"
        },
        {
          sent_at: "2026-07-02T10:00:00+09:00",
          recipient_names: ["佐藤"],
          reminder_message: "メモだけ"
        }
      ])
    ).toEqual({
      paymentRequestCount: 1,
      confirmationRequestCount: 1,
      latestPaymentRequestSentAt: "2026-07-03T10:00:00+09:00",
      latestConfirmationRequestSentAt: "2026-07-04T10:00:00+09:00",
      recentLogs: [
        {
          sentAt: "2026-07-04T10:00:00+09:00",
          recipientNames: ["鈴木"],
          kind: "confirmation_request",
          label: "確認依頼"
        },
        {
          sentAt: "2026-07-03T10:00:00+09:00",
          recipientNames: ["田中"],
          kind: "payment_request",
          label: "支払い依頼"
        },
        {
          sentAt: "2026-07-02T10:00:00+09:00",
          recipientNames: ["佐藤"],
          kind: "other",
          label: "その他"
        }
      ]
    });
  });

  it("returns an empty settlement summary when there are no logs", () => {
    expect(summarizeSettlementReminderLogs([])).toEqual({
      paymentRequestCount: 0,
      confirmationRequestCount: 0,
      latestPaymentRequestSentAt: null,
      latestConfirmationRequestSentAt: null,
      recentLogs: []
    });
  });
});
