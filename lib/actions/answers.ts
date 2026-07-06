"use server";

import { redirect } from "next/navigation";

import { canAnswerPlan, normalizeAvailabilityInput, type AvailabilityAnswer } from "@/lib/domain/availability";
import { resolveAnswerParticipantForSubmission } from "@/lib/domain/participant-identity";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

type CandidateRow = {
  id: string;
  plan_id: string;
};

export async function submitAvailabilityAnswersAction(token: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  const serverSupabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await serverSupabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, expires_at, plans(id, answer_deadline_at)")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  const plan = Array.isArray(link.plans) ? link.plans[0] : link.plans;
  if (!canAnswerPlan(plan?.answer_deadline_at ?? null, new Date())) {
    throw new Error("回答期限を過ぎています");
  }

  if (!canAnswerPlan(link.expires_at, new Date())) {
    throw new Error("共有リンクの有効期限を過ぎています");
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("candidate_dates")
    .select("id, plan_id")
    .eq("plan_id", link.plan_id)
    .order("sort_order", { ascending: true });

  if (candidatesError) {
    throw new Error(candidatesError.message);
  }

  const normalized = normalizeAvailabilityInput({
    displayName: String(formData.get("displayName") ?? ""),
    answers: ((candidates ?? []) as CandidateRow[]).map((candidate) => ({
      candidateDateId: candidate.id,
      answer: String(formData.get(`answer:${candidate.id}`) ?? "unanswered") as AvailabilityAnswer,
      comment: String(formData.get(`comment:${candidate.id}`) ?? "")
    }))
  });

  const { data: existingParticipants, error: participantsError } = await supabase
    .from("participants")
    .select("id, display_name, user_id")
    .eq("plan_id", link.plan_id);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const participantResolution = resolveAnswerParticipantForSubmission({
    participants: (existingParticipants ?? []).map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      userId: participant.user_id
    })),
    displayName: normalized.displayName,
    userId: currentUserId
  });

  const participantId =
    participantResolution.kind === "existing"
      ? participantResolution.participantId
      : (
          await supabase
            .from("participants")
            .insert({
              plan_id: link.plan_id,
              user_id: participantResolution.userId,
              display_name: participantResolution.displayName,
              participant_type: participantResolution.participantType,
              status: "answered",
              is_organizer: false
            })
            .select("id")
            .single()
        ).data?.id;

  if (!participantId) {
    throw new Error("参加者を保存できませんでした");
  }

  const answers = normalized.answers.map((answer) => ({
    candidate_date_id: answer.candidateDateId,
    participant_id: participantId,
    answer: answer.answer,
    comment: answer.comment
  }));

  const { error: answersError } = await supabase
    .from("availability_answers")
    .upsert(answers, { onConflict: "candidate_date_id,participant_id" });

  if (answersError) {
    throw new Error(answersError.message);
  }

  const participantUpdate =
    participantResolution.kind === "existing" && participantResolution.userIdToLink
      ? { status: "answered", user_id: participantResolution.userIdToLink, participant_type: "registered" }
      : { status: "answered" };

  const { error: participantError } = await supabase.from("participants").update(participantUpdate).eq("id", participantId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  redirect(`/s/${token}/answer/complete`);
}
