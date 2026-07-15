import { formatDateTime } from "@/lib/format";

export type AnswerShareLinkDraft = {
  plan_id: string;
  token: string;
  purpose: "answer";
  expires_at: string | null;
};

export function buildAnswerShareLink(
  planId: string,
  answerDeadlineAt: string | null,
  createToken: () => string = () => crypto.randomUUID()
): AnswerShareLinkDraft {
  return {
    plan_id: planId,
    token: createToken(),
    purpose: "answer",
    expires_at: answerDeadlineAt
  };
}

export function buildPublicSettlementUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/s/${token}/settlement`;
}

export type PlanDeadlineState = "none" | "open" | "soon" | "closed";

export function buildProgressSummaryLine({
  total,
  pending,
  deadlineState,
  answerDeadlineAt,
  isConfirmed
}: {
  total: number;
  pending: number;
  deadlineState: PlanDeadlineState;
  answerDeadlineAt: string | null;
  isConfirmed: boolean;
}) {
  if (isConfirmed) {
    return "日程は確定済みです。";
  }

  if (total === 0) {
    return "まだ誰も招待していません。共有リンクを配ってください。";
  }

  if (pending === 0) {
    return "全員から回答が届いています。日程を確定できます。";
  }

  if (deadlineState === "closed") {
    return "あと" + pending + "人。回答は締め切りました。";
  }

  if (answerDeadlineAt) {
    return "あと" + pending + "人。期限は" + formatDateTime(answerDeadlineAt) + "。";
  }

  return "あと" + pending + "人。";
}
