import { getEventDisplayState, getEventLastScheduleTimestamp, type EventListItem } from "@/lib/domain/event/event-filter";
import { formatDate } from "@/lib/shared/format";

const DAY_MS = 24 * 60 * 60 * 1000;

export const WRAPUP_PROMPT_DELAY_MS = 30 * DAY_MS;
export const WRAPUP_AUTO_DONE_DELAY_MS = 14 * DAY_MS;

/**
 * どのイベントも、この日付より前にはプロンプト・自動 done を出さない。
 * 「migration 049 をマージした日 + 14日」を入れる。バックフィル対象が
 * リリース直後に一斉発火するのを防ぐ保険。2週間経てば実質無効。
 */
export const WRAPUP_PROMPT_FLOOR_ISO =
  process.env.NODE_ENV === "test" ? "2000-01-01" : "2026-10-04";

export type EventWrapupInput = EventListItem & { wrapup_snoozed_until?: string | null };

export function isEventWrapupEligible(event: EventWrapupInput, now = new Date()): boolean {
  if (event.status !== "planning" && event.status !== "confirmed") {
    return false;
  }
  // completed = lifecycle 済み かつ 清算片付き済み。清算待ちなら settlement_waiting になる。
  return getEventDisplayState(event, now) === "completed";
}

export function getEventWrapupTimers(
  event: EventWrapupInput,
  options: { promptFloorIso?: string } = {}
): { promptDue: number; autoDoneDue: number } | null {
  const lastMs = getEventLastScheduleTimestamp(event);
  if (lastMs === null) {
    return null;
  }

  const snoozeMs = event.wrapup_snoozed_until ? Date.parse(event.wrapup_snoozed_until) : 0;
  const floorMs = Date.parse(`${options.promptFloorIso ?? WRAPUP_PROMPT_FLOOR_ISO}T00:00:00+09:00`);

  const promptDue = Math.max(lastMs + WRAPUP_PROMPT_DELAY_MS, snoozeMs, floorMs);
  return { promptDue, autoDoneDue: promptDue + WRAPUP_AUTO_DONE_DELAY_MS };
}

export function shouldShowWrapupPrompt(event: EventWrapupInput, now = new Date()): boolean {
  if (!isEventWrapupEligible(event, now)) {
    return false;
  }
  const timers = getEventWrapupTimers(event);
  return timers !== null && now.getTime() >= timers.promptDue;
}

export type EventWrapupSweepEvent = EventWrapupInput & {
  id: string;
  title: string;
  owner_user_id: string;
};

export type EventWrapupNotificationRow = {
  user_id: string;
  kind: "wrapup_prompt" | "wrapup_done";
  title: string;
  body: string;
  href: string;
  dedupe_key: string;
};

function promptDedupeKey(eventId: string, promptDue: number): string {
  return `event_wrapup:${eventId}:${new Date(promptDue).toISOString().slice(0, 10)}`;
}

export function planEventWrapupSweep(
  events: readonly EventWrapupSweepEvent[],
  now: Date,
  options: { autoDoneEnabled: boolean; promptFloorIso?: string }
): {
  notifications: EventWrapupNotificationRow[];
  autoComplete: string[];
  wouldAutoComplete: string[];
} {
  const notifications: EventWrapupNotificationRow[] = [];
  const autoComplete: string[] = [];
  const wouldAutoComplete: string[] = [];
  const nowMs = now.getTime();

  for (const event of events) {
    if (!isEventWrapupEligible(event, now)) {
      continue;
    }
    const timers = getEventWrapupTimers(event, { promptFloorIso: options.promptFloorIso });
    if (!timers) {
      continue;
    }

    if (nowMs >= timers.autoDoneDue) {
      if (options.autoDoneEnabled) {
        autoComplete.push(event.id);
        notifications.push({
          user_id: event.owner_user_id,
          kind: "wrapup_done",
          title: "イベントを完了にしました",
          body: `「${event.title}」を完了にしました。1ヶ月以上動きがなかったためです。`,
          href: `/events/${event.id}`,
          dedupe_key: `event_wrapup_done:${event.id}`
        });
      } else {
        wouldAutoComplete.push(event.id);
      }
      continue;
    }

    if (nowMs >= timers.promptDue) {
      const deadline = formatDate(new Date(timers.autoDoneDue).toISOString());
      notifications.push({
        user_id: event.owner_user_id,
        kind: "wrapup_prompt",
        title: "終わったイベントの確認",
        body: options.autoDoneEnabled
          ? `「${event.title}」は終わりましたか？ このまま何もしないと${deadline}に自動で完了になります。`
          : `「${event.title}」は終わりましたか？`,
        href: `/events/${event.id}`,
        dedupe_key: promptDedupeKey(event.id, timers.promptDue)
      });
    }
  }

  return { notifications, autoComplete, wouldAutoComplete };
}
