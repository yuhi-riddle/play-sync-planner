import { describe, expect, it } from "vitest";

import { eventSchema, expenseSchema, planSchema } from "@/lib/validators";

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
      candidateDates: "2026-07-15T10:00\n2026-07-16T10:00",
      answer_deadline_at: "2026-07-14T22:00",
      memo: ""
    });

    expect(result.participantNames).toEqual(["Haru", "Mio"]);
    expect(result.candidateDates).toHaveLength(2);
  });

  it("allows empty participant names because guests can join from a shared link", () => {
    const result = planSchema.parse({
      title: "",
      participantNames: "",
      candidateDates: "2026-07-15T10:00",
      answer_deadline_at: "2026-07-14T22:00",
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
        answer_deadline_at: "2026-07-14T22:00",
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
        answer_deadline_at: "2026-07-14T22:00",
        memo: ""
      })
    ).toThrow("候補日時は YYYY-MM-DDTHH:mm 形式で入力してください");
  });

  it("requires an answer deadline", () => {
    expect(() =>
      planSchema.parse({
        title: "土曜夜の回",
        participantNames: "Haru",
        candidateDates: "2026-07-15T10:00",
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
        candidateDates: "2026-07-15T10:00",
        answer_deadline_at: "tomorrow",
        memo: ""
      })
    ).toThrow("回答期限は YYYY-MM-DDTHH:mm 形式で入力してください");
  });

  it("accepts minute-level times", () => {
    const result = planSchema.parse({
      title: "",
      participantNames: "",
      candidateDates: "2026-07-15T10:07",
      candidateEndDates: "2026-07-15T12:07",
      answer_deadline_at: "2026-07-14T22:08",
      memo: ""
    });

    expect(result.candidateDates).toEqual(["2026-07-15T10:07"]);
    expect(result.candidateEndDates).toEqual(["2026-07-15T12:07"]);
    expect(result.answer_deadline_at).toBe("2026-07-14T22:08");
  });

  it("keeps all-day flags aligned with candidate dates", () => {
    const result = planSchema.parse({
      title: "",
      participantNames: "",
      candidateDates: ["2026-07-15T00:00", "2026-07-16T10:00"],
      candidateEndDates: ["2026-07-16T00:00", "2026-07-16T12:00"],
      candidateAllDays: ["true", "false"],
      answer_deadline_at: "2026-07-14T22:08",
      memo: ""
    });

    expect(result.candidateAllDays).toEqual([true, false]);
  });

  it("parses an optional reminder offset in minutes", () => {
    const result = planSchema.parse({
      title: "",
      participantNames: "",
      candidateDates: "2026-07-15T10:00",
      candidateEndDates: "2026-07-15T12:00",
      answer_deadline_at: "2026-07-14T22:00",
      reminder_offset_minutes: "1440",
      memo: ""
    });

    expect(result.reminder_offset_minutes).toBe(1440);
  });

  it("rejects a negative reminder offset", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2026-07-15T10:00",
        candidateEndDates: "2026-07-15T12:00",
        answer_deadline_at: "2026-07-14T22:00",
        reminder_offset_minutes: "-1",
        memo: ""
      })
    ).toThrow();
  });

  it("rejects past candidate dates", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2000-01-01T10:00",
        candidateEndDates: "2000-01-01T12:00",
        answer_deadline_at: "1999-12-31T22:00",
        memo: ""
      })
    ).toThrow("過去の日時は候補にできません");
  });

  it("rejects candidate end times before the start time", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2026-07-15T10:00",
        candidateEndDates: "2026-07-15T09:59",
        answer_deadline_at: "2026-07-14T22:00",
        memo: ""
      })
    ).toThrow("終了時間は開始時間より後にしてください");
  });

  it("rejects an answer deadline after the first candidate", () => {
    expect(() =>
      planSchema.parse({
        title: "",
        participantNames: "",
        candidateDates: "2026-07-15T10:00",
        answer_deadline_at: "2026-07-15T10:01",
        memo: ""
      })
    ).toThrow("回答期限は最初の候補日時より前にしてください");
  });
});

describe("expenseSchema", () => {
  it("accepts equal split expenses", () => {
    const result = expenseSchema.parse({
      title: "チケット代",
      payer_participant_id: "alice",
      amount: "3600",
      split_mode: "equal",
      split_participant_ids: ["alice", "bob", "chika"],
      memo: "",
      payment_method: "",
      payment_url: ""
    });

    expect(result.amount).toBe(3600);
    expect(result.split_participant_ids).toEqual(["alice", "bob", "chika"]);
    expect(result.payment_url).toBeNull();
  });

  it("accepts individual split expenses when the total matches the amount", () => {
    const result = expenseSchema.parse({
      title: "先払い",
      payer_participant_id: "alice",
      amount: "1500",
      split_mode: "individual",
      individual_participant_ids: ["alice", "bob"],
      individual_split_amounts: ["500", "1000"]
    });

    expect(result.individual_split_amounts).toEqual([500, 1000]);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      expenseSchema.parse({
        title: "チケット代",
        payer_participant_id: "alice",
        amount: "-1",
        split_mode: "equal",
        split_participant_ids: ["alice"]
      })
    ).toThrow("金額は0円以上で入力してください");
  });

  it("rejects individual split expenses when the total does not match", () => {
    expect(() =>
      expenseSchema.parse({
        title: "先払い",
        payer_participant_id: "alice",
        amount: "1500",
        split_mode: "individual",
        individual_participant_ids: ["alice", "bob"],
        individual_split_amounts: ["500", "900"]
      })
    ).toThrow("個別金額の合計を支払い金額と同じにしてください");
  });
});
