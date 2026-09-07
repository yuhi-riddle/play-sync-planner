import { describe, expect, it } from "vitest";

import {
  planEventWrapupSweep,
  WRAPUP_AUTO_DONE_DELAY_MS,
  WRAPUP_PROMPT_DELAY_MS,
  type EventWrapupSweepEvent
} from "@/lib/domain/event/event-wrapup";

const FLOOR = "2020-01-01";
const baseMs = new Date("2026-06-01T00:00:00+09:00").getTime();
const at = (offsetDays: number) => new Date(baseMs + offsetDays * 24 * 60 * 60 * 1000).toISOString();

function event(id: string, confirmedDayOffset: number, overrides: Partial<EventWrapupSweepEvent> = {}): EventWrapupSweepEvent {
  return {
    id,
    title: `イベント${id}`,
    owner_user_id: `owner-${id}`,
    status: "confirmed",
    start_date: null,
    end_date: null,
    plans: [
      {
        status: "date_confirmed",
        settlement_status: "not_needed",
        confirmed_start_at: at(confirmedDayOffset),
        confirmed_end_at: at(confirmedDayOffset),
        is_all_day: false
      }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

// FLOOR を差し替えるため promptFloorIso を使う planEventWrapupSweep のシグネチャ:
// 実装では options に promptFloorIso を通せるようにする（テスト用）。

describe("planEventWrapupSweep", () => {
  it("promptDue を過ぎ autoDoneDue 前なら wrapup_prompt 通知を1件出す", () => {
    const lastMs = new Date(at(-40)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("a", -40)], now, {
      autoDoneEnabled: false,
      promptFloorIso: FLOOR
    });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      user_id: "owner-a",
      kind: "wrapup_prompt",
      href: "/events/a"
    });
    expect(result.notifications[0].dedupe_key).toMatch(/^event_wrapup:a:\d{4}-\d{2}-\d{2}$/);
    expect(result.autoComplete).toEqual([]);
    expect(result.wouldAutoComplete).toEqual([]);
  });

  it("autoDoneDue を過ぎ autoDoneEnabled=true なら autoComplete と wrapup_done 通知", () => {
    const lastMs = new Date(at(-60)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("b", -60)], now, {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result.autoComplete).toEqual(["b"]);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({ kind: "wrapup_done", href: "/events/b" });
    expect(result.notifications[0].dedupe_key).toBe("event_wrapup_done:b");
  });

  it("autoDoneDue を過ぎても autoDoneEnabled=false なら wouldAutoComplete のみ、通知なし", () => {
    const lastMs = new Date(at(-60)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("c", -60)], now, {
      autoDoneEnabled: false,
      promptFloorIso: FLOOR
    });
    expect(result.wouldAutoComplete).toEqual(["c"]);
    expect(result.autoComplete).toEqual([]);
    expect(result.notifications).toEqual([]);
  });

  it("本番の wrapup_prompt 本文には自動完了の期限が入る", () => {
    const lastMs = new Date(at(-40)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("d", -40)], now, {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result.notifications[0].body).toMatch(/自動で完了/);
  });

  it("対象外イベントは何も出さない", () => {
    const result = planEventWrapupSweep([event("e", -40, { status: "done" })], new Date(), {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result).toEqual({ notifications: [], autoComplete: [], wouldAutoComplete: [] });
  });
});
