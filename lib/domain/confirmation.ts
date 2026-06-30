import type { AvailabilityAnswer } from "@/lib/domain/availability";

type CandidateSummary = {
  candidateDateId: string;
  yes: number;
  maybe: number;
  no: number;
};

type CandidateAnswerRow = {
  answer: AvailabilityAnswer;
};

type CandidateWithAnswers = {
  id: string;
  start_at: string;
  end_at: string | null;
  availability_answers: CandidateAnswerRow[];
};

type ParticipantWithStatus = {
  status: string;
};

export type CandidateAnswerSummary = {
  id: string;
  start_at: string;
  end_at: string | null;
  yes: number;
  maybe: number;
  no: number;
  unanswered: number;
  answered: number;
  totalParticipants: number;
  recommended: boolean;
  rank: number;
  score: number;
  hasPendingAnswers: boolean;
};

type ParticipantAnswer = {
  participantId: string;
  answer: AvailabilityAnswer;
};

export type ParticipantStatusUpdate = {
  participantId: string;
  status: "confirmed" | "declined";
};

export function pickRecommendedCandidate(candidates: CandidateSummary[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((a, b) => {
    if (b.yes !== a.yes) {
      return b.yes - a.yes;
    }

    if (b.maybe !== a.maybe) {
      return b.maybe - a.maybe;
    }

    return a.no - b.no;
  })[0].candidateDateId;
}

export function summarizeCandidateAnswers(
  candidates: CandidateWithAnswers[],
  totalParticipants: number
): CandidateAnswerSummary[] {
  const summaries = candidates.map((candidate) => {
    const counts = candidate.availability_answers.reduce(
      (result, answer) => {
        result[answer.answer] += 1;
        return result;
      },
      { yes: 0, maybe: 0, no: 0, unanswered: 0 }
    );
    const answered = counts.yes + counts.maybe + counts.no;
    const inferredUnanswered = Math.max(totalParticipants - candidate.availability_answers.length, 0);

    return {
      id: candidate.id,
      start_at: candidate.start_at,
      end_at: candidate.end_at,
      yes: counts.yes,
      maybe: counts.maybe,
      no: counts.no,
      unanswered: counts.unanswered + inferredUnanswered,
      answered,
      totalParticipants,
      recommended: false,
      rank: 0,
      score: candidateScore(counts.yes, counts.maybe, counts.no),
      hasPendingAnswers: counts.unanswered + inferredUnanswered > 0
    };
  });

  const recommendedId = pickRecommendedCandidate(
    summaries.map((summary) => ({
      candidateDateId: summary.id,
      yes: summary.yes,
      maybe: summary.maybe,
      no: summary.no
    }))
  );

  return rankCandidateSummaries(
    summaries.map((summary) => ({
      ...summary,
      recommended: summary.id === recommendedId
    }))
  );
}

function candidateScore(yes: number, maybe: number, no: number) {
  return yes * 3 + maybe - no * 2;
}

export function rankCandidateSummaries(candidates: CandidateAnswerSummary[]): CandidateAnswerSummary[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.yes !== a.yes) {
        return b.yes - a.yes;
      }

      if (b.maybe !== a.maybe) {
        return b.maybe - a.maybe;
      }

      if (a.no !== b.no) {
        return a.no - b.no;
      }

      if (a.unanswered !== b.unanswered) {
        return a.unanswered - b.unanswered;
      }

      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      score: candidateScore(candidate.yes, candidate.maybe, candidate.no),
      hasPendingAnswers: candidate.unanswered > 0,
      recommended: index === 0
    }));
}

export function summarizeParticipantProgress(participants: ParticipantWithStatus[]) {
  const total = participants.length;
  const pending = participants.filter((participant) => participant.status === "invited").length;

  return {
    total,
    responded: total - pending,
    pending
  };
}

export function buildConfirmationUpdates(answers: ParticipantAnswer[]): ParticipantStatusUpdate[] {
  return answers.map((answer) => ({
    participantId: answer.participantId,
    status: answer.answer === "yes" || answer.answer === "maybe" ? "confirmed" : "declined"
  }));
}
