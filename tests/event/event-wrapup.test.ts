import { describe, expect, it } from "vitest";

import {
  getEventWrapupTimers,
  isEventWrapupEligible,
  shouldShowWrapupPrompt,
  WRAPUP_AUTO_DONE_DELAY_MS,
  WRAPUP_PROMPT_DELAY_MS,
  type EventWrapupInput
} from "@/lib/domain/event/event-wrapup";

const NOW = new Date("2026-06-01T00:00:00+09:00");
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

function pastConfirmedEvent(overrides: Partial<EventWrapupInput> = {}): EventWrapupInput {
  return {
    status: "confirmed",
    start_date: null,
    end_date: null,
    plans: [
      {
        status: "date_confirmed",
        settlement_status: "not_needed",
        confirmed_start_at: iso(-40),
        confirmed_end_at: iso(-40),
        is_all_day: false
      }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

describe("isEventWrapupEligible", () => {
  it("期日超過・清算不要・confirmed は対象", () => {
    expect(isEventWrapupEligible(pastConfirmedEvent(), NOW)).toBe(true);
  });

  it("planning でも期日超過・プランなし・開催日が過去なら対象", () => {
    const event: EventWrapupInput = {
      status: "planning",
      start_date: iso(-40).slice(0, 10),
      end_date: null,
      plans: [],
      event_members: [{ status: "joined" }]
    };
    expect(isEventWrapupEligible(event, NOW)).toBe(true);
  });

  it("done / cancelled / skipped は対象外", () => {
    for (const status of ["done", "cancelled", "skipped"]) {
      expect(isEventWrapupEligible(pastConfirmedEvent({ status }), NOW)).toBe(false);
    }
  });

  it("未来の確定予定があれば対象外", () => {
    const event = pastConfirmedEvent({
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: iso(10),
          confirmed_end_at: iso(10),
          is_all_day: false
        }
      ]
    });
    expect(isEventWrapupEligible(event, NOW)).toBe(false);
  });

  it("清算待ちは対象外", () => {
    const event = pastConfirmedEvent({
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "needed",
          confirmed_start_at: iso(-40),
          confirmed_end_at: iso(-40),
          is_all_day: false
        }
      ]
    });
    expect(isEventWrapupEligible(event, NOW)).toBe(false);
  });
});

describe("getEventWrapupTimers", () => {
  it("最終開催日 + 30日 が promptDue、その 14日後が autoDoneDue", () => {
    const timers = getEventWrapupTimers(pastConfirmedEvent(), { promptFloorIso: "2020-01-01" });
    const lastMs = new Date(iso(-40)).getTime();
    expect(timers).not.toBeNull();
    expect(timers!.promptDue).toBe(lastMs + WRAPUP_PROMPT_DELAY_MS);
    expect(timers!.autoDoneDue).toBe(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS);
  });

  it("wrapup_snoozed_until が後ろにあればそちらが promptDue", () => {
    const snooze = iso(100);
    const timers = getEventWrapupTimers(
      pastConfirmedEvent({ wrapup_snoozed_until: snooze }),
      { promptFloorIso: "2020-01-01" }
    );
    expect(timers!.promptDue).toBe(new Date(snooze).getTime());
  });

  it("promptFloor が後ろにあればそちらが promptDue", () => {
    const timers = getEventWrapupTimers(pastConfirmedEvent(), { promptFloorIso: "2999-01-01" });
    expect(timers!.promptDue).toBe(new Date("2999-01-01T00:00:00+09:00").getTime());
  });

  it("最終開催日が決まらなければ null", () => {
    const event: EventWrapupInput = {
      status: "planning",
      start_date: null,
      end_date: null,
      plans: [],
      event_members: []
    };
    expect(getEventWrapupTimers(event)).toBeNull();
  });
});

describe("shouldShowWrapupPrompt", () => {
  it("promptDue を過ぎていれば true", () => {
    const later = new Date(new Date(iso(-40)).getTime() + WRAPUP_PROMPT_DELAY_MS + 1000);
    expect(shouldShowWrapupPrompt(pastConfirmedEvent(), later)).toBe(true);
  });

  it("promptDue 前なら false（期日は過ぎたが30日たっていない）", () => {
    // 5日前に終わったイベント。lifecycle は済んでいるが promptDue（+30日）はまだ先。
    const recent = pastConfirmedEvent({
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: iso(-5),
          confirmed_end_at: iso(-5),
          is_all_day: false
        }
      ]
    });
    expect(shouldShowWrapupPrompt(recent, NOW)).toBe(false);
  });

  it("恒久スヌーズ(2999)なら false", () => {
    const later = new Date("2030-01-01T00:00:00+09:00");
    expect(
      shouldShowWrapupPrompt(pastConfirmedEvent({ wrapup_snoozed_until: "2999-01-01T00:00:00Z" }), later)
    ).toBe(false);
  });
});
