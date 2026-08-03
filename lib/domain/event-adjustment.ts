import { terminalStatuses } from "@/lib/event-filter";

/**
 * 日程調整を始められるかを決める。
 * 招待を締め切っていることに加えて、イベントが終了状態（完了・中止・見送り）でないことを要求する。
 */
export function canStartDateAdjustment(eventStatus: string, inviteStatus: string | null | undefined): boolean {
  if (terminalStatuses.has(eventStatus)) {
    return false;
  }

  return inviteStatus === "closed";
}
