import { AVAILABILITY_ANSWERS } from "@/lib/constants";

export type AvailabilityAnswer = (typeof AVAILABILITY_ANSWERS)[number];

export type AvailabilityInput = {
  displayName: string;
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
  const displayName = input.displayName.trim();

  if (!displayName) {
    throw new Error("名前を入力してください");
  }

  return {
    displayName,
    answers: input.answers.map((answer) => ({
      candidateDateId: answer.candidateDateId,
      answer: answer.answer,
      comment: answer.comment?.trim() ? answer.comment.trim() : null
    }))
  };
}
