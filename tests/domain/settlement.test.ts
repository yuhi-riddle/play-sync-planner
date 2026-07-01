import { describe, expect, it } from "vitest";

import {
  buildEqualExpenseSplits,
  calculateSettlementTransfers,
  summarizeSettlementOverview,
  summarizeSettlementPaymentProgress,
  validateIndividualSplits
} from "@/lib/domain/settlement";

const participants = [
  { id: "alice", displayName: "Alice" },
  { id: "bob", displayName: "Bob" },
  { id: "chika", displayName: "Chika" }
];

describe("buildEqualExpenseSplits", () => {
  it("splits yen amounts evenly and gives the remainder to earlier participants", () => {
    expect(buildEqualExpenseSplits(1000, participants.map((participant) => participant.id))).toEqual([
      { participantId: "alice", amount: 334 },
      { participantId: "bob", amount: 333 },
      { participantId: "chika", amount: 333 }
    ]);
  });

  it("rejects a negative amount", () => {
    expect(() => buildEqualExpenseSplits(-1, ["alice"])).toThrow("金額は0円以上で入力してください");
  });
});

describe("validateIndividualSplits", () => {
  it("accepts individual splits whose total matches the expense amount", () => {
    expect(
      validateIndividualSplits(1500, [
        { participantId: "alice", amount: 500 },
        { participantId: "bob", amount: 1000 }
      ])
    ).toEqual([
      { participantId: "alice", amount: 500 },
      { participantId: "bob", amount: 1000 }
    ]);
  });

  it("rejects individual splits whose total does not match the expense amount", () => {
    expect(() =>
      validateIndividualSplits(1500, [
        { participantId: "alice", amount: 500 },
        { participantId: "bob", amount: 900 }
      ])
    ).toThrow("個別金額の合計を支払い金額と同じにしてください");
  });
});

describe("calculateSettlementTransfers", () => {
  it("nets multiple expenses into who pays whom", () => {
    const transfers = calculateSettlementTransfers({
      participants,
      expenses: [
        {
          id: "expense-1",
          payerParticipantId: "alice",
          amount: 3000,
          splits: [
            { participantId: "alice", amount: 1000 },
            { participantId: "bob", amount: 1000 },
            { participantId: "chika", amount: 1000 }
          ]
        },
        {
          id: "expense-2",
          payerParticipantId: "bob",
          amount: 900,
          splits: [
            { participantId: "alice", amount: 300 },
            { participantId: "bob", amount: 300 },
            { participantId: "chika", amount: 300 }
          ]
        }
      ]
    });

    expect(transfers).toEqual([
      { fromParticipantId: "bob", toParticipantId: "alice", amount: 400 },
      { fromParticipantId: "chika", toParticipantId: "alice", amount: 1300 }
    ]);
  });

  it("pays several creditors from one debtor with deterministic ordering", () => {
    const transfers = calculateSettlementTransfers({
      participants,
      expenses: [
        {
          id: "expense-1",
          payerParticipantId: "alice",
          amount: 1000,
          splits: [
            { participantId: "alice", amount: 500 },
            { participantId: "bob", amount: 500 }
          ]
        },
        {
          id: "expense-2",
          payerParticipantId: "chika",
          amount: 900,
          splits: [{ participantId: "bob", amount: 900 }]
        }
      ]
    });

    expect(transfers).toEqual([
      { fromParticipantId: "bob", toParticipantId: "alice", amount: 500 },
      { fromParticipantId: "bob", toParticipantId: "chika", amount: 900 }
    ]);
  });
});

describe("summarizeSettlementPaymentProgress", () => {
  it("summarizes partial settlement payments", () => {
    expect(
      summarizeSettlementPaymentProgress(3000, [
        { amount: 1000, confirmedAt: null },
        { amount: 500, confirmedAt: null }
      ])
    ).toEqual({
      paidAmount: 1500,
      confirmedAmount: 0,
      remainingAmount: 1500,
      status: "partially_paid"
    });
  });

  it("marks a settlement as paid when the full amount is recorded but not confirmed", () => {
    expect(summarizeSettlementPaymentProgress(3000, [{ amount: 3000, confirmedAt: null }])).toEqual({
      paidAmount: 3000,
      confirmedAmount: 0,
      remainingAmount: 0,
      status: "paid"
    });
  });

  it("marks a settlement as confirmed when the full amount is confirmed", () => {
    expect(summarizeSettlementPaymentProgress(3000, [{ amount: 3000, confirmedAt: "2026-07-01T00:00:00Z" }])).toEqual({
      paidAmount: 3000,
      confirmedAmount: 3000,
      remainingAmount: 0,
      status: "confirmed"
    });
  });

  it("rejects overpayments", () => {
    expect(() => summarizeSettlementPaymentProgress(3000, [{ amount: 3001, confirmedAt: null }])).toThrow(
      "支払い済み金額が請求額を超えています"
    );
  });
});

describe("summarizeSettlementOverview", () => {
  it("summarizes total, paid, confirmed, remaining amounts and status counts", () => {
    expect(
      summarizeSettlementOverview([
        {
          amount: 3000,
          payments: [{ amount: 1000, confirmedAt: null }]
        },
        {
          amount: 2000,
          payments: [{ amount: 2000, confirmedAt: "2026-07-01T00:00:00Z" }]
        },
        {
          amount: 500,
          payments: []
        }
      ])
    ).toEqual({
      settlementCount: 3,
      totalAmount: 5500,
      paidAmount: 3000,
      confirmedAmount: 2000,
      remainingAmount: 2500,
      unpaidCount: 1,
      partiallyPaidCount: 1,
      paidCount: 0,
      confirmedCount: 1
    });
  });
});
