import { canAnswerPlan } from "@/lib/domain/plan/availability";
import { shouldShowWrapupPrompt } from "@/lib/domain/event/event-wrapup";
import { getEventDisplayState, type EventDisplayState, type EventListItem, type EventListPlan } from "@/lib/domain/event/event-filter";

export type EventListGroup = "your_turn" | "waiting" | "upcoming" | "done";

export const eventListGroupLabels: Record<EventListGroup, string> = {
 your_turn: "あなたの番",
 waiting: "待ち",
 upcoming: "これから",
 done: "おわり"
};

export type EventListGroupPlan = EventListPlan & { answer_deadline_at?: string | null };
export type EventListGroupInput = Omit<EventListItem, "plans"> & {
 wrapup_snoozed_until?: string | null;
 plans?: readonly EventListGroupPlan[] | null;
};

const yourTurnDisplayStates = new Set<EventDisplayState>([
 "schedule_creation_waiting",
 "participant_waiting",
 "settlement_waiting"
]);

/**
 * 一覧を「やること」で束ねるためのグループ判定。
 * wrapup対象（開催済み・清算不要で放置され、確認帯が出る段階）は displayState が
 * completed でも「あなたの番」を優先する。
 */
export function getEventListGroup(event: EventListGroupInput, now = new Date()): EventListGroup {
 if (shouldShowWrapupPrompt(event, now)) {
  return "your_turn";
 }

 const displayState = getEventDisplayState(event, now);

 if (yourTurnDisplayStates.has(displayState)) {
  return "your_turn";
 }

 if (displayState === "answer_waiting") {
  const hasOpenAnswerCollection = (event.plans ?? []).some(
   (plan) => plan.status === "collecting_answers" && canAnswerPlan(plan.answer_deadline_at ?? null, now)
  );
  return hasOpenAnswerCollection ? "waiting" : "your_turn";
 }

 if (displayState === "event_waiting") {
  return "upcoming";
 }

 return "done";
}
