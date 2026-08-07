"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/form-data";
import { jstIsoFromDateTimeLocal } from "@/lib/jst";
import { errorState, failWith, type ActionState } from "@/lib/domain/action-state";
import { extendedAnswerDeadline, parseAnswerDeadlineExtensionDays } from "@/lib/domain/answer-deadline";
import { buildPlanParticipantsFromMembers, canStartPlanFromMembers, type EventMember } from "@/lib/domain/event-members";
import { buildAnswerShareLink } from "@/lib/domain/plans";
import { buildNotificationCandidate } from "@/lib/domain/site-notifications";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import { planSchema } from "@/lib/validators";

/**
 * フォームから届くのは datetime-local の生文字列（"2026-07-15T10:00"、オフセット無し）。
 * new Date() に直接渡すとサーバーの TZ で解釈され、Vercel(UTC) では
 * ユーザーが選んだ時刻より 9 時間あとの値が保存されてしまう。必ず JST として解釈する。
 */
function toIsoDateTime(value: string): string {
  return jstIsoFromDateTimeLocal(value);
}

function normalizeReminderOffsets(values: { reminder_offset_minutes: number | null; reminder_offsets_minutes: number[] }) {
  const offsets =
    values.reminder_offsets_minutes.length > 0
      ? values.reminder_offsets_minutes
      : values.reminder_offset_minutes === null
        ? []
        : [values.reminder_offset_minutes];

  return Array.from(new Set(offsets)).sort((a, b) => b - a);
}

export async function createPlanAction(
  eventId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const parsed = planSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const values = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: eventMembers, error: membersError } = await supabase
    .from("event_members")
    .select("event_id, user_id, display_name, role, status")
    .eq("event_id", eventId)
    .eq("status", "joined");

  if (membersError) {
    return failWith("参加者を読み込めませんでした。", membersError);
  }

  const members = (eventMembers ?? []).map((member) => ({
    eventId: member.event_id,
    userId: member.user_id,
    displayName: member.display_name,
    role: member.role,
    status: member.status
  })) as EventMember[];
  if (!canStartPlanFromMembers(members) || !members.some((member) => member.userId === userId && member.role === "organizer" && member.status === "joined")) {
    return errorState("主催者を含む参加者を集めてから日程調整を作成してください。");
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .insert({
      event_id: eventId,
      owner_user_id: userId,
      title: values.title,
      answer_deadline_at: toIsoDateTime(values.answer_deadline_at),
      memo: values.memo,
      status: "collecting_answers",
      settlement_status: "not_started",
      ticket_status: "not_purchased"
    })
    .select("id")
    .single();

  if (planError) {
    return failWith("日程調整を作成できませんでした。", planError);
  }

  const participants = buildPlanParticipantsFromMembers(members, plan.id);

  const candidateDates = values.candidateDates.map((candidateDate, index) => ({
    plan_id: plan.id,
    start_at: toIsoDateTime(candidateDate),
    end_at: values.candidateEndDates[index] ? toIsoDateTime(values.candidateEndDates[index]) : null,
    is_all_day: values.candidateAllDays[index] ?? false,
    sort_order: index
  }));

  const shareLink = buildAnswerShareLink(plan.id, toIsoDateTime(values.answer_deadline_at));
  const reminderOffsets = normalizeReminderOffsets(values);
  const reminderSetting = {
    plan_id: plan.id,
    reminder_offset_minutes: reminderOffsets[0] ?? null,
    reminder_offsets_minutes: reminderOffsets
  };

  const [{ error: participantsError }, { error: datesError }, { error: linkError }, { error: reminderError }] = await Promise.all([
    participants.length > 0 ? supabase.from("participants").insert(participants) : Promise.resolve({ error: null }),
    supabase.from("candidate_dates").insert(candidateDates),
    supabase.from("share_links").insert(shareLink),
    supabase.from("plan_reminder_settings").insert(reminderSetting)
  ]);

  if (participantsError || datesError || linkError || reminderError) {
    return failWith(
      "日程調整を作成できませんでした。",
      participantsError ?? datesError ?? linkError ?? reminderError
    );
  }

  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  redirect(`/plans/${plan.id}`);
}

export async function updatePlanAction(
  planId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const parsed = planSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const values = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .update({
      title: values.title,
      answer_deadline_at: toIsoDateTime(values.answer_deadline_at),
      memo: values.memo
    })
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .select("event_id")
    .single();

  if (planError) {
    return failWith("日程調整を更新できませんでした。", planError);
  }

  const shouldReplaceParticipants = formData.has("participantNames");

  await supabase.from("availability_answers").delete().in(
    "candidate_date_id",
    await supabase
      .from("candidate_dates")
      .select("id")
      .eq("plan_id", planId)
      .then(({ data }) => (data ?? []).map((row) => row.id))
  );
  if (shouldReplaceParticipants) {
    await supabase.from("participants").delete().eq("plan_id", planId);
  }
  await supabase.from("candidate_dates").delete().eq("plan_id", planId);

  const participants = values.participantNames.map((displayName) => ({
    plan_id: planId,
    display_name: displayName,
    participant_type: "guest",
    status: "invited",
    is_organizer: false
  }));

  const candidateDates = values.candidateDates.map((candidateDate, index) => ({
    plan_id: planId,
    start_at: toIsoDateTime(candidateDate),
    end_at: values.candidateEndDates[index] ? toIsoDateTime(values.candidateEndDates[index]) : null,
    is_all_day: values.candidateAllDays[index] ?? false,
    sort_order: index
  }));
  const reminderOffsets = normalizeReminderOffsets(values);
  const reminderSetting = {
    plan_id: planId,
    reminder_offset_minutes: reminderOffsets[0] ?? null,
    reminder_offsets_minutes: reminderOffsets
  };

  const [{ error: participantsError }, { error: datesError }, { error: reminderError }] = await Promise.all([
    shouldReplaceParticipants && participants.length > 0
      ? supabase.from("participants").insert(participants)
      : Promise.resolve({ error: null }),
    supabase.from("candidate_dates").insert(candidateDates),
    supabase.from("plan_reminder_settings").upsert(reminderSetting, { onConflict: "plan_id" })
  ]);

  if (participantsError || datesError || reminderError) {
    return failWith("日程調整を更新できませんでした。", participantsError ?? datesError ?? reminderError);
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}`);
}

/**
 * 回答期限を延ばす。
 *
 * 期限切れの共有リンクは行き止まりで、参加者から主催者に知らせる手段が画面に無い。
 * 予定編集の4ステップを通さずに、その場で開け直せるようにする。
 *
 * plans.answer_deadline_at だけ延ばしても回答はできない。共有リンクは
 * 作成時点の期限を expires_at に写して持っており（buildAnswerShareLink）、
 * 回答の受付は両方を見ているため（lib/actions/answers.ts）。
 */
export async function extendPlanAnswerDeadlineAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const days = parseAnswerDeadlineExtensionDays(formData.get("days"));
  if (!days) {
    throw new Error("延ばす日数が正しくありません。");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, event_id, answer_deadline_at")
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (planError || !plan) {
    throw new Error("この日程調整を管理する権限がありません。");
  }

  const deadline = extendedAnswerDeadline(plan.answer_deadline_at, days, new Date());

  const admin = createSupabaseAdminClient();
  const [{ error: planUpdateError }, { error: shareLinkUpdateError }] = await Promise.all([
    admin.from("plans").update({ answer_deadline_at: deadline }).eq("id", planId),
    admin
      .from("share_links")
      .update({ expires_at: deadline })
      .eq("plan_id", planId)
      .eq("purpose", "answer")
      .eq("status", "open")
  ]);

  if (planUpdateError || shareLinkUpdateError) {
    throw new Error(planUpdateError?.message ?? shareLinkUpdateError?.message);
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
}

export async function restartPlanAdjustmentAction(planId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, event_id, owner_user_id, title")
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .single();

  if (planError || !plan) {
    throw new Error("この日程調整を再開する権限がありません。");
  }

  const admin = createSupabaseAdminClient();
  const { data: candidateDates, error: candidateDatesError } = await admin
    .from("candidate_dates")
    .select("id")
    .eq("plan_id", planId);
  if (candidateDatesError) {
    throw new Error(candidateDatesError.message);
  }

  const candidateDateIds = (candidateDates ?? []).map((candidateDate) => candidateDate.id);
  if (candidateDateIds.length > 0) {
    const { error } = await admin.from("availability_answers").delete().in("candidate_date_id", candidateDateIds);
    if (error) {
      throw new Error(error.message);
    }
  }

  const [{ error: planUpdateError }, { error: eventUpdateError }, { error: participantsUpdateError }] = await Promise.all([
    admin
      .from("plans")
      .update({ status: "collecting_answers", confirmed_start_at: null, confirmed_end_at: null, is_all_day: false })
      .eq("id", planId),
    admin.from("events").update({ status: "planning" }).eq("id", plan.event_id),
    admin.from("participants").update({ status: "invited" }).eq("plan_id", planId)
  ]);
  if (planUpdateError || eventUpdateError || participantsUpdateError) {
    throw new Error(planUpdateError?.message ?? eventUpdateError?.message ?? participantsUpdateError?.message);
  }

  const [{ data: participants, error: participantsError }, { data: shareLink, error: shareLinkError }] = await Promise.all([
    admin.from("participants").select("user_id").eq("plan_id", planId).not("user_id", "is", null),
    admin
      .from("share_links")
      .select("token")
      .eq("plan_id", planId)
      .eq("purpose", "answer")
      .eq("status", "open")
      .maybeSingle()
  ]);
  if (participantsError || shareLinkError) {
    throw new Error(participantsError?.message ?? shareLinkError?.message);
  }

  const notificationTime = new Date().toISOString();
  const notifications = (participants ?? []).flatMap((participant) => {
    if (!participant.user_id || !shareLink?.token) {
      return [];
    }
    const notification = buildNotificationCandidate({
      userId: participant.user_id,
      kind: "unanswered",
      planId,
      title: plan.title ?? "日程調整",
      href: `/s/${shareLink.token}/answer`,
      dueAt: `restart:${notificationTime}`
    });
    return [{
      user_id: notification.userId,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      dedupe_key: notification.dedupeKey,
      read_at: null
    }];
  });
  if (notifications.length > 0) {
    const { error } = await admin.from("notifications").upsert(notifications, { onConflict: "user_id,dedupe_key" });
    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}`);
}
