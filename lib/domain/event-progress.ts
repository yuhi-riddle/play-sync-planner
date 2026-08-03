import { eventStatusLabels } from "@/lib/constants";
import { terminalStatuses } from "@/lib/event-filter";

export type EventProgressPlan = {
  status: string;
  confirmed_start_at: string | null;
  answer_deadline_at: string | null;
};

export type EventProgress = {
  statusLabel: string;
  highlightLabel: string | null;
  highlightAt: string | null;
};

/**
 * イベント名の下に出す進行状況の要約を決める。
 * 終了状態(done/cancelled/skipped)はラベルだけ返し、開催日時や回答期限は出さない。
 * 終了イベントでは本文側の案内文を抑止しているので、このピルが唯一の状態表示になる。
 */
export function resolveEventProgress(eventStatus: string, plans: EventProgressPlan[]): EventProgress {
  if (terminalStatuses.has(eventStatus)) {
    const statusLabel = eventStatusLabels[eventStatus as keyof typeof eventStatusLabels] ?? eventStatus;
    return { statusLabel, highlightLabel: null, highlightAt: null };
  }

  const statusLabel = eventStatus === "confirmed" ? "確定" : plans.length > 0 ? "日程調整中" : "参加者募集中";

  const confirmedStarts = plans
    .map((plan) => plan.confirmed_start_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (confirmedStarts.length > 0) {
    return { statusLabel, highlightLabel: "開催日時", highlightAt: confirmedStarts[0] };
  }

  const deadlines = plans
    .map((plan) => plan.answer_deadline_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (deadlines.length > 0) {
    return { statusLabel, highlightLabel: "回答期限", highlightAt: deadlines[0] };
  }

  return { statusLabel, highlightLabel: null, highlightAt: null };
}
