import type { AvailabilityAnswer } from "@/lib/domain/availability";

type CandidateSummary = {
  candidateDateId: string;
  yes: number;
  maybe: number;
  no: number;
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

export function buildConfirmationUpdates(answers: ParticipantAnswer[]): ParticipantStatusUpdate[] {
  return answers.map((answer) => ({
    participantId: answer.participantId,
    status: answer.answer === "yes" || answer.answer === "maybe" ? "confirmed" : "declined"
  }));
}
