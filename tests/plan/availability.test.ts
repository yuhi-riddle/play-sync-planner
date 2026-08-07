import { describe, expect, it } from "vitest";

import { canAnswerPlan, normalizeAvailabilityInput } from "@/lib/domain/plan/availability";

describe("canAnswerPlan", () => {
  it("allows answers when the plan has no deadline", () => {
    expect(canAnswerPlan(null, new Date("2026-06-26T10:00:00Z"))).toBe(true);
  });

  it("blocks answers after the deadline has passed", () => {
    expect(
      canAnswerPlan("2026-06-26T09:59:59Z", new Date("2026-06-26T10:00:00Z"))
    ).toBe(false);
  });

  it("allows answers at the exact deadline", () => {
    expect(
      canAnswerPlan("2026-06-26T10:00:00Z", new Date("2026-06-26T10:00:00Z"))
    ).toBe(true);
  });
});

describe("normalizeAvailabilityInput", () => {
  it("空コメントは null に寄せる", () => {
    const result = normalizeAvailabilityInput({
      answers: [
        { candidateDateId: "date-1", answer: "yes", comment: "OK" },
        { candidateDateId: "date-2", answer: "maybe", comment: "  " }
      ]
    });

    expect(result).toEqual({
      answers: [
        { candidateDateId: "date-1", answer: "yes", comment: "OK" },
        { candidateDateId: "date-2", answer: "maybe", comment: null }
      ]
    });
  });

  it("throws when an answer value is invalid", () => {
    expect(() =>
      normalizeAvailabilityInput({
        answers: [{ candidateDateId: "date-1", answer: "invalid" as never, comment: null }]
      })
    ).toThrow("回答は ○ / △ / × から選んでください");
  });
});
