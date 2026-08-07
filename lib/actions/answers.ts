"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAnswerPlan, normalizeAvailabilityInput, type AvailabilityAnswer } from "@/lib/domain/availability";
import { resolveAnswerParticipantForSubmission } from "@/lib/domain/participant-identity";
import { buildPreviousAnswerMap, type PreviousAnswer, type PreviousAnswerRow } from "@/lib/domain/previous-answers";
import { buildAnswerReceivedNotificationInput, buildNotificationCandidate } from "@/lib/domain/site-notifications";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

type CandidateRow = {
  id: string;
  plan_id: string;
};

type AnswerPlanRow = {
  id: string;
  title: string | null;
  owner_user_id: string;
  answer_deadline_at: string | null;
  events?: { title: string | null } | { title: string | null }[] | null;
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
    .select("plan_id, expires_at, status, plans(id, title, owner_user_id, answer_deadline_at, events(title))")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  if (link.status === "revoked") {
    throw new Error("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
  }

  const plan = (Array.isArray(link.plans) ? link.plans[0] : link.plans) as AnswerPlanRow | null;
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

  if (plan && currentUserId !== plan.owner_user_id) {
    const notification = buildNotificationCandidate(
      buildAnswerReceivedNotificationInput({
        ownerUserId: plan.owner_user_id,
        planId: plan.id,
        title: answerNotificationTitle(plan),
        participantId,
        participantName: normalized.displayName
      })
    );

    const { error: notificationError } = await supabase.from("notifications").upsert(
      {
        user_id: notification.userId,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        dedupe_key: notification.dedupeKey
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
    );

    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  revalidatePath("/");
  revalidatePath(`/plans/${link.plan_id}`);
  redirect(`/s/${token}/answer/complete`);
}

export type PreviousAnswersResult =
  | { found: false }
  | { found: true; participantName: string; answers: Record<string, PreviousAnswer> };

const NOT_FOUND: PreviousAnswersResult = { found: false };

/**
 * 名前を入れた時点で、その人の前回の回答を引く。
 *
 * 誰を引くかは submitAvailabilityAnswersAction と同じ
 * resolveAnswerParticipantForSubmission で決める。ここがずれると、
 * 画面にはAさんの回答が出ているのに送信でBさんを上書きする、という事故になる。
 *
 * 見つからない理由（リンク切れ・期限切れ・初回）は返さない。
 * 名前を入れただけの人に出す情報ではないし、回答ページ側で別途出している。
 */
export async function loadPreviousAnswersAction(token: string, displayName: string): Promise<PreviousAnswersResult> {
  const trimmedName = displayName.trim();
  if (!trimmedName) {
    return NOT_FOUND;
  }

  const supabase = createSupabaseAdminClient();
  const serverSupabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await serverSupabase.auth.getUser();

  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, expires_at, status, plans(answer_deadline_at)")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link || link.status === "revoked") {
    return NOT_FOUND;
  }

  const plan = (Array.isArray(link.plans) ? link.plans[0] : link.plans) as { answer_deadline_at: string | null } | null;
  const now = new Date();
  // 回答できない状態なら、前回の回答も出さない。出しても送信で弾かれる。
  if (!canAnswerPlan(plan?.answer_deadline_at ?? null, now) || !canAnswerPlan(link.expires_at, now)) {
    return NOT_FOUND;
  }

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("id, display_name, user_id")
    .eq("plan_id", link.plan_id);

  if (participantsError) {
    return NOT_FOUND;
  }

  const resolution = resolveAnswerParticipantForSubmission({
    participants: (participants ?? []).map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      userId: participant.user_id
    })),
    displayName: trimmedName,
    userId: user?.id ?? null
  });

  if (resolution.kind !== "existing") {
    return NOT_FOUND;
  }

  const { data: rows, error: rowsError } = await supabase
    .from("availability_answers")
    .select("candidate_date_id, answer, comment")
    .eq("participant_id", resolution.participantId);

  if (rowsError) {
    return NOT_FOUND;
  }

  const answers = buildPreviousAnswerMap((rows ?? []) as PreviousAnswerRow[]);
  if (Object.keys(answers).length === 0) {
    return NOT_FOUND;
  }

  const participantName =
    (participants ?? []).find((participant) => participant.id === resolution.participantId)?.display_name ?? trimmedName;

  return { found: true, participantName, answers };
}

function answerNotificationTitle(plan: AnswerPlanRow) {
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  return [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" / ") || "日程調整";
}
