export type ReminderLogRecord = {
  sent_at: string;
};

export type SettlementReminderLogRecord = {
  sent_at: string;
  recipient_names: string[] | null;
  reminder_message: string | null;
};

export type ReminderLogSummary = {
  latestSentAt: string | null;
  totalCount: number;
};

export type SettlementReminderKind = "payment_request" | "confirmation_request" | "other";

export type SettlementReminderLogView = {
  sentAt: string;
  recipientNames: string[];
  kind: SettlementReminderKind;
  label: string;
};

export type SettlementReminderLogSummary = {
  paymentRequestCount: number;
  confirmationRequestCount: number;
  latestPaymentRequestSentAt: string | null;
  latestConfirmationRequestSentAt: string | null;
  recentLogs: SettlementReminderLogView[];
};

export function summarizeReminderLogs(logs: ReminderLogRecord[]): ReminderLogSummary {
  if (logs.length === 0) {
    return {
      latestSentAt: null,
      totalCount: 0
    };
  }

  const latestSentAt = [...logs].sort((left, right) => right.sent_at.localeCompare(left.sent_at))[0]?.sent_at ?? null;

  return {
    latestSentAt,
    totalCount: logs.length
  };
}

export function summarizeSettlementReminderLogs(logs: SettlementReminderLogRecord[]): SettlementReminderLogSummary {
  const recentLogs = [...logs]
    .sort((left, right) => right.sent_at.localeCompare(left.sent_at))
    .map<SettlementReminderLogView>((log) => {
      const kind = inferSettlementReminderKind(log.reminder_message);
      return {
        sentAt: log.sent_at,
        recipientNames: log.recipient_names ?? [],
        kind,
        label: settlementReminderKindLabel(kind)
      };
    });

  const paymentRequestLogs = recentLogs.filter((log) => log.kind === "payment_request");
  const confirmationRequestLogs = recentLogs.filter((log) => log.kind === "confirmation_request");

  return {
    paymentRequestCount: paymentRequestLogs.length,
    confirmationRequestCount: confirmationRequestLogs.length,
    latestPaymentRequestSentAt: paymentRequestLogs[0]?.sentAt ?? null,
    latestConfirmationRequestSentAt: confirmationRequestLogs[0]?.sentAt ?? null,
    recentLogs
  };
}

function inferSettlementReminderKind(message: string | null): SettlementReminderKind {
  if (!message) {
    return "other";
  }

  if (message.includes("受け取り確認")) {
    return "confirmation_request";
  }

  if (message.includes("清算のお願い") || message.includes("支払いをお願いします")) {
    return "payment_request";
  }

  return "other";
}

function settlementReminderKindLabel(kind: SettlementReminderKind) {
  if (kind === "payment_request") {
    return "支払い依頼";
  }

  if (kind === "confirmation_request") {
    return "確認依頼";
  }

  return "その他";
}
