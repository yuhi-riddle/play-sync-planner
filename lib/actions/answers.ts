"use server";

import { redirect } from "next/navigation";

import { canAnswerPlan, normalizeAvailabilityInput, type AvailabilityAnswer } from "@/lib/domain/availability";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type CandidateRow = {
  id: string;
  plan_id: string;
};

export async function submitAvailabilityAnswersAction(token: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
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

  const { data: existingParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("plan_id", link.plan_id)
    .eq("display_name", normalized.displayName)
    .maybeSingle();

  const participantId =
    existingParticipant?.id ??
    (
      await supabase
        .from("participants")
        .insert({
          plan_id: link.plan_id,
          display_name: normalized.displayName,
          participant_type: "guest",
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

  const { error: participantError } = await supabase
    .from("participants")
    .update({ status: "answered" })
    .eq("id", participantId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  redirect(`/s/${token}/answer/complete`);
}
