import { describe, expect, it } from "vitest";

import { buildReminderMessage, pendingParticipants } from "@/lib/domain/settlement/reminder-message";

describe("pendingParticipants", () => {
  it("returns participants whose status is invited", () => {
    expect(
      pendingParticipants([
        { display_name: "鈴木", status: "invited" },
        { display_name: "佐藤", status: "answered" },
        { display_name: "田中", status: "invited" }
      ])
    ).toEqual([
      { display_name: "鈴木", status: "invited" },
      { display_name: "田中", status: "invited" }
    ]);
  });
});

describe("buildReminderMessage", () => {
  it("builds a reminder message with the plan title, pending names, deadline, and share URL", () => {
    expect(
      buildReminderMessage({
        eventTitle: "謎解き公演",
        planTitle: "土曜夜の回",
        pendingNames: ["鈴木", "田中"],
        answerDeadlineAt: "2026-07-01T21:00:00+09:00",
        shareUrl: "https://example.com/s/token/answer"
      })
    ).toContain("鈴木さん、田中さん");
    expect(
      buildReminderMessage({
        eventTitle: "謎解き公演",
        planTitle: "土曜夜の回",
        pendingNames: ["鈴木", "田中"],
        answerDeadlineAt: "2026-07-01T21:00:00+09:00",
        shareUrl: "https://example.com/s/token/answer"
      })
    ).toContain("謎解き公演 / 土曜夜の回");
    expect(
      buildReminderMessage({
        eventTitle: "謎解き公演",
        planTitle: "土曜夜の回",
        pendingNames: ["鈴木", "田中"],
        answerDeadlineAt: "2026-07-01T21:00:00+09:00",
        shareUrl: "https://example.com/s/token/answer"
      })
    ).toContain("2026/07/01 21:00");
    expect(
      buildReminderMessage({
        eventTitle: "謎解き公演",
        planTitle: "土曜夜の回",
        pendingNames: ["鈴木", "田中"],
        answerDeadlineAt: "2026-07-01T21:00:00+09:00",
        shareUrl: "https://example.com/s/token/answer"
      })
    ).toContain("https://example.com/s/token/answer");
  });

  it("includes the manual reminder timing when a reminder offset is set", () => {
    const message = buildReminderMessage({
      eventTitle: "Event",
      planTitle: "Plan",
      pendingNames: ["Haru"],
      answerDeadlineAt: "2026-07-01T21:00:00+09:00",
      reminderOffsetMinutes: 1440,
      shareUrl: "https://example.com/s/token/answer"
    } as Parameters<typeof buildReminderMessage>[0] & { reminderOffsetMinutes: number });

    expect(message).toContain("リマインド: 2026/06/30 21:00");
    expect(message).not.toContain("繝");
  });

  it("formats custom reminder offsets", () => {
    expect(
      buildReminderMessage({
        eventTitle: "Event",
        planTitle: "Plan",
        pendingNames: ["Haru"],
        answerDeadlineAt: "2026-07-01T21:00:00+09:00",
        reminderOffsetMinutes: 360,
        shareUrl: "https://example.com/s/token/answer"
      } as Parameters<typeof buildReminderMessage>[0] & { reminderOffsetMinutes: number })
    ).toContain("リマインド: 2026/07/01 15:00");
  });

  it("formats multiple reminder offsets", () => {
    const message = buildReminderMessage({
      eventTitle: "Event",
      planTitle: "Plan",
      pendingNames: ["Haru"],
      answerDeadlineAt: "2026-07-01T21:00:00+09:00",
      reminderOffsetsMinutes: [1440, 180],
      shareUrl: "https://example.com/s/token/answer"
    });

    expect(message).toContain("リマインド: 2026/06/30 21:00、2026/07/01 18:00");
  });
});
