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
