import { AVAILABILITY_ANSWERS } from "@/lib/shared/constants";

export type AvailabilityAnswer = (typeof AVAILABILITY_ANSWERS)[number];

export type AvailabilityInput = {
  answers: Array<{
    candidateDateId: string;
    answer: AvailabilityAnswer;
    comment: string | null;
  }>;
};

export function canAnswerPlan(deadlineIso: string | null, now: Date): boolean {
  if (!deadlineIso) {
    return true;
  }

  return now.getTime() <= new Date(deadlineIso).getTime();
}

export function normalizeAvailabilityInput(input: AvailabilityInput): AvailabilityInput {
  return {
    answers: input.answers.map((answer) => ({
      candidateDateId: answer.candidateDateId,
      answer: normalizeAvailabilityAnswer(answer.answer),
      comment: answer.comment?.trim() ? answer.comment.trim() : null
    }))
  };
}

function normalizeAvailabilityAnswer(answer: string): AvailabilityAnswer {
  if (!AVAILABILITY_ANSWERS.includes(answer as AvailabilityAnswer) || answer === "unanswered") {
    throw new Error("回答は ○ / △ / × から選んでください");
  }

  return answer as AvailabilityAnswer;
}
