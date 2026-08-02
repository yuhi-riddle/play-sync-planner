import { formatYenText as formatAmount } from "@/lib/format";

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

export type SettlementStatusTone = "muted" | "warning" | "active" | "done";

export type SettlementStatusView = {
  label: string;
  detail: string;
  tone: SettlementStatusTone;
};

export type SettlementPaymentRequest = {
  fromName: string;
  toName: string;
  remainingAmount: number;
  paymentMethod?: string | null;
  paymentUrl?: string | null;
  memo?: string | null;
};

export type SettlementConfirmationRequestMessageInput = {
  title: string | null | undefined;
  settlementUrl?: string | null;
  requests: SettlementNextActionItem[];
};

export type SettlementNextActionInput = {
  fromName: string;
  toName: string;
  amount: number;
  payments: SettlementPaymentForProgress[];
};

export type SettlementNextActionItem = {
  participantName: string;
  counterpartyName: string;
  amount: number;
};

export type SettlementNextActions = {
  paymentWaiting: SettlementNextActionItem[];
  confirmationWaiting: SettlementNextActionItem[];
  isComplete: boolean;
};

export type PaymentInstructionView = {
  methodLabel: string;
  detail: string;
  linkLabel: string;
  hasExternalLink: boolean;
};

const settlementStatusViews: Record<string, SettlementStatusView> = {
  not_started: {
    label: "未開始",
    detail: "日程確定後に使います",
    tone: "muted"
  },
  not_needed: {
    label: "清算なし",
    detail: "支払い待ちはありません",
    tone: "done"
  },
  needed: {
    label: "清算待ち",
    detail: "立替内容を確認してください",
    tone: "warning"
  },
  settling: {
    label: "清算中",
    detail: "支払い記録の確認待ちです",
    tone: "active"
  },
  settled: {
    label: "清算済み",
    detail: "支払いは完了しています",
    tone: "done"
  }
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

export function resolveParticipantSettlementRole(
  participantId: string,
  settlements: Array<{ fromParticipantId: string; toParticipantId: string }>
): "receive" | "pay" | null {
  const isReceiver = settlements.some((settlement) => settlement.toParticipantId === participantId);
  if (isReceiver) {
    return "receive";
  }

  const isPayer = settlements.some((settlement) => settlement.fromParticipantId === participantId);
  return isPayer ? "pay" : null;
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

export function getSettlementStatusView(status: string | null | undefined): SettlementStatusView {
  return (
    settlementStatusViews[status ?? ""] ?? {
      label: "清算未設定",
      detail: "清算画面で確認してください",
      tone: "muted"
    }
  );
}

export function getPaymentInstructionView(
  paymentMethod: string | null | undefined,
  paymentUrl: string | null | undefined
): PaymentInstructionView {
  const normalizedMethod = paymentMethod?.trim();
  const hasExternalLink = Boolean(paymentUrl?.trim());

  if (normalizedMethod && /paypay/i.test(normalizedMethod)) {
    return {
      methodLabel: "PayPay",
      detail: hasExternalLink ? "外部決済ページを開いて支払えます" : "PayPayで支払います",
      linkLabel: "PayPayで支払う",
      hasExternalLink
    };
  }

  if (normalizedMethod && /(銀行|振込|口座)/.test(normalizedMethod)) {
    return {
      methodLabel: "銀行振込",
      detail: hasExternalLink ? "振込先情報を開けます" : "振込先はメモを確認してください",
      linkLabel: "振込先情報を開く",
      hasExternalLink
    };
  }

  if (normalizedMethod && /(現金|手渡し)/.test(normalizedMethod)) {
    return {
      methodLabel: "現金",
      detail: "当日または手渡しで支払います",
      linkLabel: "支払い先を開く",
      hasExternalLink
    };
  }

  return {
    methodLabel: normalizedMethod || "送金先",
    detail: hasExternalLink ? "支払い先ページを開けます" : "支払い方法を確認してください",
    linkLabel: "支払い先を開く",
    hasExternalLink
  };
}

export function summarizeSettlementNextActions(settlements: SettlementNextActionInput[]): SettlementNextActions {
  const actions = settlements.reduce<SettlementNextActions>(
    (result, settlement) => {
      const progress = summarizeSettlementPaymentProgress(settlement.amount, settlement.payments);
      const confirmationWaitingAmount = progress.paidAmount - progress.confirmedAmount;

      if (progress.remainingAmount > 0) {
        result.paymentWaiting.push({
          participantName: settlement.fromName,
          counterpartyName: settlement.toName,
          amount: progress.remainingAmount
        });
      }

      if (confirmationWaitingAmount > 0) {
        result.confirmationWaiting.push({
          participantName: settlement.toName,
          counterpartyName: settlement.fromName,
          amount: confirmationWaitingAmount
        });
      }

      return result;
    },
    {
      paymentWaiting: [],
      confirmationWaiting: [],
      isComplete: false
    }
  );

  return {
    ...actions,
    isComplete: actions.paymentWaiting.length === 0 && actions.confirmationWaiting.length === 0
  };
}

export function buildSettlementPaymentRequestMessage({
  title,
  publicSettlementUrl,
  requests
}: {
  title: string | null | undefined;
  publicSettlementUrl?: string | null;
  requests: SettlementPaymentRequest[];
}) {
  const activeRequests = requests.filter((request) => request.remainingAmount > 0);
  if (activeRequests.length === 0) {
    return "";
  }

  const lines = ["清算のお願いです。", "", `${title?.trim() || "日程調整"} の清算をお願いします。`, ""];

  activeRequests.forEach((request, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(`${toPoliteName(request.fromName)}`);
    lines.push(`${toPoliteName(request.toName)}へ ${formatYenText(request.remainingAmount)} の支払いをお願いします。`);

    if (request.paymentMethod) {
      lines.push(`支払い方法: ${request.paymentMethod}`);
    }

    if (request.paymentUrl) {
      lines.push(`支払い先: ${request.paymentUrl}`);
    }

    if (request.memo) {
      lines.push(`メモ: ${request.memo}`);
    }
  });

  if (publicSettlementUrl) {
    lines.push("", `支払い・清算ページ: ${publicSettlementUrl}`);
    lines.push("", "支払いが終わったら、上のページから支払いを記録してください。");
  } else {
    lines.push("", "支払いが終わったら、Madoi上で支払いを記録してください。");
  }

  return lines.join("\n");
}

export function buildSettlementConfirmationRequestMessage({
  title,
  settlementUrl,
  requests
}: SettlementConfirmationRequestMessageInput) {
  const activeRequests = requests.filter((request) => request.amount > 0);
  if (activeRequests.length === 0) {
    return "";
  }

  const grouped = activeRequests.reduce<Map<string, SettlementNextActionItem[]>>((result, request) => {
    const items = result.get(request.participantName) ?? [];
    items.push(request);
    result.set(request.participantName, items);
    return result;
  }, new Map());

  const lines = ["受け取り確認のお願いです。", "", `${title?.trim() || "日程調整"} の清算で、支払い記録があります。`, ""];

  Array.from(grouped.entries()).forEach(([participantName, items], index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(toPoliteName(participantName));
    items.forEach((item) => {
      lines.push(`${toPoliteName(item.counterpartyName)}から ${formatYenText(item.amount)} の支払い記録があります。`);
    });
  });

  if (settlementUrl) {
    lines.push("", `清算ページ: ${settlementUrl}`);
  }

  lines.push("", "Madoiで受け取り確認をお願いします。");

  return lines.join("\n");
}

function toPoliteName(name: string) {
  const trimmed = name.trim() || "参加者";
  return /(さん|様|くん|君|ちゃん)$/.test(trimmed) ? trimmed : `${trimmed}さん`;
}

function formatYenText(amount: number) {
  assertYenAmount(amount);
  return formatAmount(amount);
}
