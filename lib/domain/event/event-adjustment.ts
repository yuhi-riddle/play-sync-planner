import { terminalStatuses } from "@/lib/domain/event/event-filter";

/**
 * 日程調整を始められるかを決める。
 * 招待を締め切っていることに加えて、イベントが終了状態（完了・中止・見送り）でないことを要求する。
 */
export function canStartDateAdjustment(eventStatus: string, inviteStatus: string | null | undefined): boolean {
  if (isTerminalEventStatus(eventStatus)) {
    return false;
  }

  return inviteStatus === "closed";
}

/**
 * イベントが終了状態（完了・中止・見送り）かどうかを返す。
 * canStartDateAdjustment はこれと「招待が締め切られているか」の2つを合成した値であり、
 * 「まだ募集中/調整準備中/終了済み」の3状態を1つの真偽値に潰してしまう。
 * 終了状態かどうかだけを知りたい呼び出し側（募集中の案内文を出し分ける箇所など）は、
 * canStartDateAdjustment ではなくこちらを使うこと。
 */
export function isTerminalEventStatus(eventStatus: string): boolean {
  return terminalStatuses.has(eventStatus);
}
