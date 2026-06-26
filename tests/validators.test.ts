import { describe, expect, it } from "vitest";

import { eventSchema, planSchema } from "@/lib/validators";

describe("eventSchema", () => {
  it("accepts a minimal event", () => {
    const result = eventSchema.parse({
      category: "nazotoki",
      title: "地下謎への招待状",
      url: "",
      location_name: "",
      address: "",
      start_date: "",
      end_date: "",
      price: "",
      capacity: "",
      status: "interested",
      memo: ""
    });

    expect(result.title).toBe("地下謎への招待状");
    expect(result.price).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(() =>
      eventSchema.parse({
        category: "nazotoki",
        title: " ",
        status: "interested"
      })
    ).toThrow("タイトルを入力してください");
  });

  it("requires a selected category", () => {
    expect(() =>
      eventSchema.parse({
        category: "",
        title: "週末の予定",
        status: "interested"
      })
    ).toThrow("カテゴリを選択してください");
  });

  it("defaults event status when it is omitted", () => {
    const result = eventSchema.parse({
      category: "nazotoki",
      title: "週末の予定",
      url: "",
      location_name: "",
      address: "",
      start_date: "",
      end_date: "",
      price: "",
      capacity: "",
      memo: ""
    });

    expect(result.status).toBe("interested");
  });
});

describe("planSchema", () => {
  it("keeps participant names and candidate dates in order", () => {
    const result = planSchema.parse({
      title: "土曜夜の回",
      participantNames: "Haru\nMio",
      candidateDates: "2026-07-01T10:00\n2026-07-02T10:00",
      answer_deadline_at: "2026-06-30T22:00",
      memo: ""
    });

    expect(result.participantNames).toEqual(["Haru", "Mio"]);
    expect(result.candidateDates).toHaveLength(2);
  });

  it("allows empty participant names because guests can join from a shared link", () => {
    const result = planSchema.parse({
      title: "",
      participantNames: "",
      candidateDates: "2026-07-01T10:00",
      answer_deadline_at: "2026-06-30T22:00",
      memo: ""
    });

    expect(result.participantNames).toEqual([]);
  });

  it("requires at least one candidate date", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "Haru",
        candidateDates: "",
        answer_deadline_at: "2026-06-30T22:00",
        memo: ""
      })
    ).toThrow("候補日時を1つ以上選択してください");
  });

  it("rejects invalid candidate dates", () => {
    expect(() =>
      planSchema.parse({
        title: "土曜夜の回",
        participantNames: "Haru",
        candidateDates: "not-a-date",
        answer_deadline_at: "2026-06-30T22:00",
        memo: ""
      })
    ).toThrow("候補日時は YYYY-MM-DDTHH:mm 形式で入力してください");
  });

  it("requires an answer deadline", () => {
    expect(() =>
      planSchema.parse({
        title: "土曜夜の回",
        participantNames: "Haru",
        candidateDates: "2026-07-01T10:00",
        answer_deadline_at: "",
        memo: ""
      })
    ).toThrow("回答期限を選択してください");
  });

  it("rejects an invalid answer deadline", () => {
    expect(() =>
      planSchema.parse({
        title: "土曜夜の回",
        participantNames: "Haru",
        candidateDates: "2026-07-01T10:00",
        answer_deadline_at: "tomorrow",
        memo: ""
      })
    ).toThrow("回答期限は YYYY-MM-DDTHH:mm 形式で入力してください");
  });

  it("rejects date times outside 15 minute steps", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2026-07-01T10:07",
        answer_deadline_at: "2026-06-30T22:00",
        memo: ""
      })
    ).toThrow("候補日時は15分単位で選択してください");
  });

  it("rejects answer deadline outside 15 minute steps", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2026-07-01T10:00",
        answer_deadline_at: "2026-07-01T09:10",
        memo: ""
      })
    ).toThrow("回答期限は15分単位で選択してください");
  });
});
