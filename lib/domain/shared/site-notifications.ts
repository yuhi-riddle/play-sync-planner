export type NotificationKind =
  | "answer_deadline"
  | "unanswered"
  | "answer_received"
  | "settlement_needed"
  | "payment_due"
  | "confirmation_due"
  | "event_message";

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

export type ReadableNotification = {
  read_at?: string | null;
  readAt?: string | null;
};

export type NotificationReadFilter = "unread" | "read";
export type NotificationActionFilter = "all" | "deadline" | "unanswered" | "settlement" | "payment" | "confirmation";

export type ActionFilterableNotification = {
  kind: NotificationKind | string;
};

export type NotificationActionCounts = Record<NotificationActionFilter, number>;

export type PlanNotificationParticipant = {
  display_name: string | null;
  status: string | null;
};

export type PlanNotificationSettlementPayment = {
  amount: number | null;
  confirmed_at: string | null;
};

export type PlanNotificationSettlement = {
  amount: number | null;
  status: string | null;
  from_participant_id: string | null;
  participants?: { display_name: string | null } | { display_name: string | null }[] | null;
  settlement_payments?: PlanNotificationSettlementPayment[];
};

export type PlanNotificationReminderSetting = {
  reminder_offset_minutes: number | null;
  reminder_offsets_minutes?: number[] | null;
};

export type PlanNotificationPlan = {
  id: string;
  owner_user_id: string;
  title: string | null;
  status: string;
  settlement_status: string | null;
  answer_deadline_at: string | null;
  events: { title: string | null } | { title: string | null }[] | null;
  participants?: PlanNotificationParticipant[];
  settlements?: PlanNotificationSettlement[];
  plan_reminder_settings?: PlanNotificationReminderSetting[] | PlanNotificationReminderSetting | null;
};

const notificationTitles: Record<NotificationKind, string> = {
  answer_deadline: "回答期限が近づいています",
  unanswered: "未回答者がいます",
  answer_received: "日程回答が届きました",
  settlement_needed: "清算の準備が必要です",
  payment_due: "支払い待ちがあります",
  confirmation_due: "受け取り確認待ちがあります",
  event_message: "イベントに新しいメッセージがあります"
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

export function onlyUnreadNotifications<T extends ReadableNotification>(notifications: T[]): T[] {
  return filterNotificationsByReadState(notifications, "unread");
}

export function filterNotificationsByReadState<T extends ReadableNotification>(
  notifications: T[],
  filter: NotificationReadFilter
): T[] {
  return notifications.filter((notification) => {
    const isRead = Boolean(notification.read_at ?? notification.readAt);
    return filter === "read" ? isRead : !isRead;
  });
}

export function filterNotificationsByActionFilter<T extends ActionFilterableNotification>(
  notifications: T[],
  filter: NotificationActionFilter
): T[] {
  return notifications.filter((notification) => {
    const notificationFilter = actionFilterForKind(notification.kind);
    return filter === "all" ? notificationFilter !== null : notificationFilter === filter;
  });
}

export function countNotificationsByActionFilter<T extends ActionFilterableNotification>(
  notifications: T[]
): NotificationActionCounts {
  return {
    all: filterNotificationsByActionFilter(notifications, "all").length,
    deadline: filterNotificationsByActionFilter(notifications, "deadline").length,
    unanswered: filterNotificationsByActionFilter(notifications, "unanswered").length,
    settlement: filterNotificationsByActionFilter(notifications, "settlement").length,
    payment: filterNotificationsByActionFilter(notifications, "payment").length,
    confirmation: filterNotificationsByActionFilter(notifications, "confirmation").length
  };
}

export function resolveNotificationActionFilter(
  requestedFilter: NotificationActionFilter,
  counts: NotificationActionCounts
): NotificationActionFilter {
  return requestedFilter !== "all" && counts[requestedFilter] === 0 ? "all" : requestedFilter;
}

export function buildAnswerReceivedNotificationInput({
  ownerUserId,
  planId,
  title,
  participantId,
  participantName
}: {
  ownerUserId: string;
  planId: string;
  title: string;
  participantId: string;
  participantName: string;
}): NotificationCandidateInput {
  return {
    userId: ownerUserId,
    kind: "answer_received",
    planId,
    title,
    href: `/plans/${planId}`,
    dueAt: participantId,
    participantNames: [participantName]
  };
}

export function buildPlanNotificationInputs(plan: PlanNotificationPlan, now: Date): NotificationCandidateInput[] {
  const title = planTitle(plan);
  const inputs: NotificationCandidateInput[] = [];

  if (plan.status === "collecting_answers") {
    const pendingNames = (plan.participants ?? [])
      .filter((participant) => participant.status === "invited")
      .map((participant) => participant.display_name ?? "参加者");

    if (pendingNames.length > 0) {
      inputs.push({
        userId: plan.owner_user_id,
        kind: "unanswered",
        planId: plan.id,
        title,
        href: `/plans/${plan.id}`,
        participantNames: pendingNames
      });
    }

    reminderDueKeys(plan.answer_deadline_at, reminderOffsets(plan.plan_reminder_settings), now).forEach((dueKey) => {
      inputs.push({
        userId: plan.owner_user_id,
        kind: "answer_deadline",
        planId: plan.id,
        title,
        href: `/plans/${plan.id}`,
        dueAt: dueKey
      });
    });
  }

  if (plan.status === "date_confirmed" && plan.settlement_status === "needed") {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "settlement_needed",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`
    });
  }

  const unpaidNames = (plan.settlements ?? [])
    .filter((settlement) => settlement.status !== "confirmed" && remainingAmount(settlement) > 0)
    .map((settlement) => participantName(settlement))
    .filter(Boolean);

  if (unpaidNames.length > 0) {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "payment_due",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`,
      participantNames: uniqueNames(unpaidNames)
    });
  }

  const confirmationNames = (plan.settlements ?? [])
    .filter((settlement) => (settlement.settlement_payments ?? []).some((payment) => !payment.confirmed_at))
    .map((settlement) => participantName(settlement))
    .filter(Boolean);

  if (confirmationNames.length > 0) {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "confirmation_due",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`,
      participantNames: uniqueNames(confirmationNames)
    });
  }

  return inputs;
}

function actionFilterForKind(kind: string): NotificationActionFilter | null {
  switch (kind) {
    case "answer_deadline":
      return "deadline";
    case "unanswered":
      return "unanswered";
    case "answer_received":
      return "unanswered";
    case "settlement_needed":
      return "settlement";
    case "payment_due":
      return "payment";
    case "confirmation_due":
      return "confirmation";
    default:
      return null;
  }
}

const priorityFilterRank: Record<Exclude<NotificationActionFilter, "all">, number> = {
  payment: 0,
  deadline: 0,
  settlement: 1,
  confirmation: 1,
  unanswered: 2
};

function priorityRankForKind(kind: string): number {
  const filter = actionFilterForKind(kind);
  if (!filter || filter === "all") {
    return 99;
  }

  return priorityFilterRank[filter];
}

/** 「対応が必要なこと」カードに1件だけプレビュー表示するとき、支払い・期限を最優先にする。 */
export function selectPriorityNotification<T extends { kind: string; created_at?: string }>(
  notifications: T[]
): T | null {
  if (notifications.length === 0) {
    return null;
  }

  return [...notifications].sort((a, b) => {
    const rankDiff = priorityRankForKind(a.kind) - priorityRankForKind(b.kind);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0];
}

function planTitle(plan: PlanNotificationPlan) {
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  return [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" / ") || "日程調整";
}

function reminderOffsets(settings: PlanNotificationPlan["plan_reminder_settings"]) {
  const setting = Array.isArray(settings) ? settings[0] : settings;
  const offsets = setting?.reminder_offsets_minutes?.length
    ? setting.reminder_offsets_minutes
    : setting?.reminder_offset_minutes === null || setting?.reminder_offset_minutes === undefined
      ? []
      : [setting.reminder_offset_minutes];

  return Array.from(new Set(offsets)).filter((offset) => Number.isFinite(offset) && offset > 0);
}

function reminderDueKeys(answerDeadlineAt: string | null, offsetsMinutes: number[], now: Date) {
  if (!answerDeadlineAt) {
    return [];
  }

  const deadlineTime = new Date(answerDeadlineAt).getTime();
  const nowTime = now.getTime();
  if (nowTime >= deadlineTime) {
    return [];
  }

  return offsetsMinutes
    .sort((a, b) => b - a)
    .filter((offsetMinutes) => nowTime >= deadlineTime - offsetMinutes * 60 * 1000)
    .map((offsetMinutes) => `${answerDeadlineAt}:${offsetMinutes}`);
}

function remainingAmount(settlement: PlanNotificationSettlement) {
  const total = settlement.amount ?? 0;
  const paid = (settlement.settlement_payments ?? []).reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  return Math.max(total - paid, 0);
}

function participantName(settlement: PlanNotificationSettlement) {
  const participant = Array.isArray(settlement.participants) ? settlement.participants[0] : settlement.participants;
  return participant?.display_name?.trim() ?? "";
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names));
}

function buildNotificationBody(input: NotificationCandidateInput) {
  const participantText = formatParticipantNames(input.participantNames);

  switch (input.kind) {
    case "answer_deadline":
      return `${input.title} の回答期限を確認してください。`;
    case "unanswered":
      return participantText ? `${input.title} で ${participantText} が未回答です。` : `${input.title} に未回答者がいます。`;
    case "answer_received":
      return participantText ? `${input.title} に${participantText}が回答しました。` : `${input.title} に回答が届きました。`;
    case "settlement_needed":
      return `${input.title} の清算内容を確認してください。`;
    case "payment_due":
      return participantText ? `${input.title} で ${participantText} の支払い待ちがあります。` : `${input.title} で支払い待ちがあります。`;
    case "confirmation_due":
      return participantText ? `${input.title} で ${participantText} の受け取り確認待ちがあります。` : `${input.title} で受け取り確認待ちがあります。`;
    case "event_message":
      return `${input.title}に新しいメッセージがあります。`;
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
