import { describe, expect, it } from "vitest";

import { eventListGroupLabels, getEventListGroup } from "@/lib/domain/event/event-list-group";

const now = new Date("2026-07-15T12:00:00+09:00");

describe("getEventListGroup", () => {
  it("7つの派生状態をあなたの番／これから／おわりに割り振る", () => {
    const cases = [
      [{ status: "planning", plans: [] }, "your_turn"],
      [{ status: "interested", plans: [] }, "your_turn"],
      [{ status: "done", plans: [{ settlement_status: "needed" }] }, "your_turn"],
      [
        {
          status: "confirmed",
          plans: [
            {
              status: "date_confirmed",
              settlement_status: "not_started",
              confirmed_start_at: "2026-08-01T10:00:00+09:00"
            }
          ]
        },
        "upcoming"
      ],
      [{ status: "done", plans: [{ settlement_status: "settled" }] }, "done"],
      [{ status: "cancelled", plans: [{ settlement_status: "not_started" }] }, "done"]
    ] as const;

    for (const [event, expected] of cases) {
      expect(getEventListGroup(event, now)).toBe(expected);
    }
  });

  it("answer_waiting は回答受付中の候補が残っていれば待ち", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-20T00:00:00+09:00" }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("waiting");
  });

  it("answer_waiting は全ての回答受付が締め切られていればあなたの番", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-01T00:00:00+09:00" }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("your_turn");
  });

  it("answer_waiting で締切未設定の候補が1つでも残っていれば待ち", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-01T00:00:00+09:00" },
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: null }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("waiting");
  });

  it("wrapup対象（開催済み・清算不要・放置）は completed でもあなたの番", () => {
    const longAgo = "2026-01-01T10:00:00+09:00";
    const event = {
      status: "confirmed",
      wrapup_snoozed_until: null,
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: longAgo,
          confirmed_end_at: longAgo,
          is_all_day: false
        }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("your_turn");
  });

  it("ラベルは4種類", () => {
    expect(eventListGroupLabels).toEqual({
      your_turn: "あなたの番",
      waiting: "待ち",
      upcoming: "これから",
      done: "おわり"
    });
  });
});
