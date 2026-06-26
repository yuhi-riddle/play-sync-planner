import { describe, expect, it } from "vitest";

import { buildConfirmationUpdates, pickRecommendedCandidate } from "@/lib/domain/confirmation";

describe("pickRecommendedCandidate", () => {
  it("picks the candidate with the most yes answers and then maybe answers", () => {
    const candidateId = pickRecommendedCandidate([
      { candidateDateId: "a", yes: 2, maybe: 1, no: 0 },
      { candidateDateId: "b", yes: 2, maybe: 3, no: 1 },
      { candidateDateId: "c", yes: 1, maybe: 5, no: 0 }
    ]);

    expect(candidateId).toBe("b");
  });

  it("returns null when there are no candidates", () => {
    expect(pickRecommendedCandidate([])).toBeNull();
  });
});

describe("buildConfirmationUpdates", () => {
  it("confirms yes and maybe participants and declines no participants", () => {
    const updates = buildConfirmationUpdates([
      { participantId: "p1", answer: "yes" },
      { participantId: "p2", answer: "maybe" },
      { participantId: "p3", answer: "no" },
      { participantId: "p4", answer: "unanswered" }
    ]);

    expect(updates).toEqual([
      { participantId: "p1", status: "confirmed" },
      { participantId: "p2", status: "confirmed" },
      { participantId: "p3", status: "declined" },
      { participantId: "p4", status: "declined" }
    ]);
  });
});
