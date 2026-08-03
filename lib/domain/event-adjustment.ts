/**
 * 日程調整を始められるかを決める。
 * 招待を締め切っていることに加えて、イベントが中止されていないことを要求する。
 */
export function canStartDateAdjustment(eventStatus: string, inviteStatus: string | null | undefined): boolean {
  if (eventStatus === "cancelled") {
    return false;
  }

  return inviteStatus === "closed";
}
