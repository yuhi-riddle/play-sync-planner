import { describe, expect, it } from "vitest";

import {
  buildConfirmationUpdates,
  pickRecommendedCandidate,
  summarizeCandidateAnswers,
  summarizeParticipantProgress
} from "@/lib/domain/confirmation";

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

describe("summarizeCandidateAnswers", () => {
  it("counts answers and infers unanswered participants from the participant total", () => {
    const summaries = summarizeCandidateAnswers(
      [
        {
          id: "date-1",
          start_at: "2026-07-01T10:00:00Z",
          end_at: "2026-07-01T12:00:00Z",
          availability_answers: [{ answer: "yes" }, { answer: "maybe" }]
        },
        {
          id: "date-2",
          start_at: "2026-07-02T10:00:00Z",
          end_at: null,
          availability_answers: [{ answer: "no" }]
        }
      ],
      3
    );

    expect(summaries).toEqual([
      {
        id: "date-1",
        start_at: "2026-07-01T10:00:00Z",
        end_at: "2026-07-01T12:00:00Z",
        yes: 1,
        maybe: 1,
        no: 0,
        unanswered: 1,
        answered: 2,
        totalParticipants: 3,
        recommended: true
      },
      {
        id: "date-2",
        start_at: "2026-07-02T10:00:00Z",
        end_at: null,
        yes: 0,
        maybe: 0,
        no: 1,
        unanswered: 2,
        answered: 1,
        totalParticipants: 3,
        recommended: false
      }
    ]);
  });
});

describe("summarizeParticipantProgress", () => {
  it("treats invited participants as pending and the others as responded", () => {
    expect(
      summarizeParticipantProgress([
        { status: "invited" },
        { status: "answered" },
        { status: "confirmed" },
        { status: "declined" }
      ])
    ).toEqual({
      total: 4,
      responded: 3,
      pending: 1
    });
  });
});
