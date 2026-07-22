"use server";

import { redirect } from "next/navigation";

import {
  canAnswerPlan,
  normalizeAvailabilityInput,
  type AvailabilityAnswer
} from "@/lib/domain/availability";
import { resolveAnswerParticipantForSubmission } from "@/lib/domain/participant-identity";
import {
  getPublicAnswerData,
  savePublicAnswer
} from "@/lib/server/admin/public-answer";
import { consumePublicLimit } from "@/lib/server/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function submitAvailabilityAnswersAction(token: string, formData: FormData) {
  const data = await getPublicAnswerData(token);
  if (!data) throw new Error("共有リンクが見つかりません。");

  const now = new Date();
  if (!canAnswerPlan(data.answerDeadlineAt, now)) {
    throw new Error("回答期限を過ぎています。");
  }
  if (!canAnswerPlan(data.expiresAt, now)) {
    throw new Error("共有リンクの有効期限を過ぎています。");
  }

  const normalized = normalizeAvailabilityInput({
    displayName: String(formData.get("displayName") ?? ""),
    answers: data.candidates.map((candidate) => ({
      candidateDateId: candidate.id,
      answer: String(
        formData.get(`answer:${candidate.id}`) ?? "unanswered"
      ) as AvailabilityAnswer,
      comment: String(formData.get(`comment:${candidate.id}`) ?? "")
    }))
  });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const resolution = resolveAnswerParticipantForSubmission({
    participants: data.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      userId: participant.user_id
    })),
    displayName: normalized.displayName,
    userId: currentUserId
  });

  await consumePublicLimit("public_answer", token);
  await savePublicAnswer({
    linkId: data.linkId,
    planId: data.planId,
    ownerUserId: data.ownerUserId,
    title:
      [data.eventTitle, data.title]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(" / ") || "日程調整",
    participant:
      resolution.kind === "existing"
        ? {
            kind: "existing",
            id: resolution.participantId,
            userIdToLink: resolution.userIdToLink
          }
        : {
            kind: "new",
            userId: resolution.userId,
            displayName: resolution.displayName,
            participantType: resolution.participantType
          },
    displayName: normalized.displayName,
    answers: normalized.answers.map((answer) => ({
      candidateDateId: answer.candidateDateId,
      answer: answer.answer,
      comment: answer.comment
    })),
    currentUserId
  });

  redirect(`/s/${token}/answer/complete`);
}
