import { describe, expect, it } from "vitest";

import {
  buildConfirmationUpdates,
  pickRecommendedCandidate,
  rankCandidateSummaries,
  summarizeCandidateAnswers,
  summarizeParticipantProgress
} from "@/lib/domain/plan/confirmation";

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
        recommended: true,
        rank: 1,
        score: 4,
        hasPendingAnswers: true
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
        recommended: false,
        rank: 2,
        score: -2,
        hasPendingAnswers: true
      }
    ]);
  });

  it("returns ranked summaries with the best candidate first", () => {
    const summaries = summarizeCandidateAnswers(
      [
        {
          id: "date-late",
          start_at: "2026-07-03T19:00:00+09:00",
          end_at: "2026-07-03T21:00:00+09:00",
          availability_answers: [{ answer: "yes" }, { answer: "no" }, { answer: "unanswered" }]
        },
        {
          id: "date-best",
          start_at: "2026-07-02T13:00:00+09:00",
          end_at: "2026-07-02T15:00:00+09:00",
          availability_answers: [{ answer: "yes" }, { answer: "yes" }, { answer: "maybe" }]
        },
        {
          id: "date-ok",
          start_at: "2026-07-01T10:00:00+09:00",
          end_at: "2026-07-01T12:00:00+09:00",
          availability_answers: [{ answer: "yes" }, { answer: "maybe" }, { answer: "maybe" }]
        }
      ],
      3
    );

    expect(summaries.map((summary) => summary.id)).toEqual(["date-best", "date-ok", "date-late"]);
    expect(summaries.map((summary) => summary.rank)).toEqual([1, 2, 3]);
    expect(summaries[0]).toEqual(expect.objectContaining({ recommended: true, hasPendingAnswers: false }));
    expect(summaries[2]).toEqual(expect.objectContaining({ hasPendingAnswers: true }));
  });
});

describe("rankCandidateSummaries", () => {
  it("uses unanswered count and start time as tie breakers", () => {
    const ranked = rankCandidateSummaries([
      {
        id: "with-pending",
        start_at: "2026-07-01T10:00:00+09:00",
        end_at: null,
        yes: 2,
        maybe: 0,
        no: 0,
        unanswered: 1,
        answered: 2,
        totalParticipants: 3,
        recommended: false,
        rank: 0,
        score: 0,
        hasPendingAnswers: true
      },
      {
        id: "earlier",
        start_at: "2026-07-01T09:00:00+09:00",
        end_at: null,
        yes: 2,
        maybe: 0,
        no: 0,
        unanswered: 0,
        answered: 2,
        totalParticipants: 2,
        recommended: false,
        rank: 0,
        score: 0,
        hasPendingAnswers: false
      }
    ]);

    expect(ranked.map((summary) => summary.id)).toEqual(["earlier", "with-pending"]);
    expect(ranked.map((summary) => summary.rank)).toEqual([1, 2]);
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
