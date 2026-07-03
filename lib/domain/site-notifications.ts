export type NotificationKind = "answer_deadline" | "unanswered" | "settlement_needed" | "payment_due" | "confirmation_due";

export type NotificationCandidateInput = {
  userId: string;
  kind: NotificationKind;
  planId: string;
  title: string;
  href: string;
  dueAt?: string | null;
  participantNames?: string[];
};

export type NotificationCandidate = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  createdAt?: string;
};

export type NotificationSummary = {
  unreadCount: number;
  latest: NotificationCandidate[];
};

const notificationTitles: Record<NotificationKind, string> = {
  answer_deadline: "回答期限が近づいています",
  unanswered: "未回答者がいます",
  settlement_needed: "清算の準備が必要です",
  payment_due: "支払い待ちがあります",
  confirmation_due: "受け取り確認待ちがあります"
};

export function buildNotificationCandidate(input: NotificationCandidateInput): NotificationCandidate {
  return {
    userId: input.userId,
    kind: input.kind,
    title: notificationTitles[input.kind],
    body: buildNotificationBody(input),
    href: input.href,
    dedupeKey: buildDedupeKey(input)
  };
}

export function summarizeUnreadNotifications(notifications: NotificationCandidate[], limit = 3): NotificationSummary {
  return {
    unreadCount: notifications.length,
    latest: [...notifications]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, limit)
  };
}

function buildNotificationBody(input: NotificationCandidateInput) {
  const participantText = formatParticipantNames(input.participantNames);

  switch (input.kind) {
    case "answer_deadline":
      return `${input.title} の回答期限を確認してください。`;
    case "unanswered":
      return participantText ? `${input.title} で ${participantText} が未回答です。` : `${input.title} に未回答者がいます。`;
    case "settlement_needed":
      return `${input.title} の清算内容を確認してください。`;
    case "payment_due":
      return participantText ? `${input.title} で ${participantText} の支払い待ちがあります。` : `${input.title} で支払い待ちがあります。`;
    case "confirmation_due":
      return participantText ? `${input.title} で ${participantText} の受け取り確認待ちがあります。` : `${input.title} で受け取り確認待ちがあります。`;
  }
}

function buildDedupeKey(input: NotificationCandidateInput) {
  const participantKey = (input.participantNames ?? []).map((name) => name.trim()).filter(Boolean).join("|");
  const suffix = input.dueAt ?? participantKey;

  return suffix ? `${input.kind}:${input.planId}:${suffix}` : `${input.kind}:${input.planId}`;
}

function formatParticipantNames(names: string[] | undefined) {
  const formatted = (names ?? []).map(toPoliteName).filter(Boolean);
  return formatted.join("、");
}

function toPoliteName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }

  if (/(さん|様|くん|君|ちゃん)$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}さん`;
}
