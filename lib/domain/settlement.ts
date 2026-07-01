export type SettlementParticipant = {
  id: string;
  displayName: string;
};

export type ExpenseSplit = {
  participantId: string;
  amount: number;
};

export type ExpenseForSettlement = {
  id: string;
  payerParticipantId: string;
  amount: number;
  splits: ExpenseSplit[];
};

export type SettlementTransfer = {
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
};

export type SettlementPaymentForProgress = {
  amount: number;
  confirmedAt: string | null;
};

export type SettlementPaymentProgress = {
  paidAmount: number;
  confirmedAmount: number;
  remainingAmount: number;
  status: "unpaid" | "partially_paid" | "paid" | "confirmed";
};

export type SettlementForOverview = {
  amount: number;
  payments: SettlementPaymentForProgress[];
};

export type SettlementOverview = {
  settlementCount: number;
  totalAmount: number;
  paidAmount: number;
  confirmedAmount: number;
  remainingAmount: number;
  unpaidCount: number;
  partiallyPaidCount: number;
  paidCount: number;
  confirmedCount: number;
};

type SettlementInput = {
  participants: SettlementParticipant[];
  expenses: ExpenseForSettlement[];
};

function assertYenAmount(amount: number) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("金額は0円以上で入力してください");
  }
}

function assertKnownParticipant(participantIds: Set<string>, participantId: string) {
  if (!participantIds.has(participantId)) {
    throw new Error("参加者が見つかりません");
  }
}

export function buildEqualExpenseSplits(amount: number, participantIds: string[]): ExpenseSplit[] {
  assertYenAmount(amount);

  if (participantIds.length === 0) {
    throw new Error("負担者を1人以上選択してください");
  }

  const baseAmount = Math.floor(amount / participantIds.length);
  const remainder = amount % participantIds.length;

  return participantIds.map((participantId, index) => ({
    participantId,
    amount: baseAmount + (index < remainder ? 1 : 0)
  }));
}

export function validateIndividualSplits(amount: number, splits: ExpenseSplit[]): ExpenseSplit[] {
  assertYenAmount(amount);

  if (splits.length === 0) {
    throw new Error("負担者を1人以上選択してください");
  }

  const seen = new Set<string>();
  let total = 0;

  const normalized = splits.map((split) => {
    assertYenAmount(split.amount);

    if (seen.has(split.participantId)) {
      throw new Error("同じ参加者が重複しています");
    }

    seen.add(split.participantId);
    total += split.amount;

    return {
      participantId: split.participantId,
      amount: split.amount
    };
  });

  if (total !== amount) {
    throw new Error("個別金額の合計を支払い金額と同じにしてください");
  }

  return normalized;
}

export function calculateSettlementTransfers({ participants, expenses }: SettlementInput): SettlementTransfer[] {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const balances = new Map<string, number>(participants.map((participant) => [participant.id, 0]));

  expenses.forEach((expense) => {
    assertYenAmount(expense.amount);
    assertKnownParticipant(participantIds, expense.payerParticipantId);
    const splits = validateIndividualSplits(expense.amount, expense.splits);

    balances.set(expense.payerParticipantId, (balances.get(expense.payerParticipantId) ?? 0) + expense.amount);

    splits.forEach((split) => {
      assertKnownParticipant(participantIds, split.participantId);
      balances.set(split.participantId, (balances.get(split.participantId) ?? 0) - split.amount);
    });
  });

  const creditors = participants
    .map((participant) => ({
      participantId: participant.id,
      amount: balances.get(participant.id) ?? 0
    }))
    .filter((balance) => balance.amount > 0);
  const debtors = participants
    .map((participant) => ({
      participantId: participant.id,
      amount: Math.abs(balances.get(participant.id) ?? 0)
    }))
    .filter((balance) => balance.amount > 0 && (balances.get(balance.participantId) ?? 0) < 0);

  const transfers: SettlementTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amount
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) {
      creditorIndex += 1;
    }

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }
  }

  return transfers;
}

export function summarizeSettlementPaymentProgress(
  settlementAmount: number,
  payments: SettlementPaymentForProgress[]
): SettlementPaymentProgress {
  assertYenAmount(settlementAmount);

  const paidAmount = payments.reduce((total, payment) => {
    assertYenAmount(payment.amount);
    return total + payment.amount;
  }, 0);
  const confirmedAmount = payments.reduce((total, payment) => total + (payment.confirmedAt ? payment.amount : 0), 0);

  if (paidAmount > settlementAmount) {
    throw new Error("支払い済み金額が請求額を超えています");
  }

  const remainingAmount = settlementAmount - paidAmount;
  const status =
    settlementAmount === 0 || confirmedAmount === settlementAmount
      ? "confirmed"
      : paidAmount === settlementAmount
        ? "paid"
        : paidAmount > 0
          ? "partially_paid"
          : "unpaid";

  return {
    paidAmount,
    confirmedAmount,
    remainingAmount,
    status
  };
}

export function summarizeSettlementOverview(settlements: SettlementForOverview[]): SettlementOverview {
  return settlements.reduce<SettlementOverview>(
    (overview, settlement) => {
      const progress = summarizeSettlementPaymentProgress(settlement.amount, settlement.payments);

      return {
        settlementCount: overview.settlementCount + 1,
        totalAmount: overview.totalAmount + settlement.amount,
        paidAmount: overview.paidAmount + progress.paidAmount,
        confirmedAmount: overview.confirmedAmount + progress.confirmedAmount,
        remainingAmount: overview.remainingAmount + progress.remainingAmount,
        unpaidCount: overview.unpaidCount + (progress.status === "unpaid" ? 1 : 0),
        partiallyPaidCount: overview.partiallyPaidCount + (progress.status === "partially_paid" ? 1 : 0),
        paidCount: overview.paidCount + (progress.status === "paid" ? 1 : 0),
        confirmedCount: overview.confirmedCount + (progress.status === "confirmed" ? 1 : 0)
      };
    },
    {
      settlementCount: 0,
      totalAmount: 0,
      paidAmount: 0,
      confirmedAmount: 0,
      remainingAmount: 0,
      unpaidCount: 0,
      partiallyPaidCount: 0,
      paidCount: 0,
      confirmedCount: 0
    }
  );
}
