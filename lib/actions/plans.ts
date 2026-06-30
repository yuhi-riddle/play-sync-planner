"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formDataToObject } from "@/lib/form-data";
import { buildAnswerShareLink } from "@/lib/domain/plans";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import { planSchema } from "@/lib/validators";

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export async function createPlanAction(eventId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = planSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .insert({
      event_id: eventId,
      owner_user_id: userId,
      title: values.title,
      answer_deadline_at: values.answer_deadline_at,
      memo: values.memo,
      status: "collecting_answers",
      settlement_status: "not_started",
      ticket_status: "not_purchased"
    })
    .select("id")
    .single();

  if (planError) {
    throw new Error(planError.message);
  }

  const participants = values.participantNames.map((displayName) => ({
    plan_id: plan.id,
    display_name: displayName,
    participant_type: "guest",
    status: "invited",
    is_organizer: false
  }));

  const candidateDates = values.candidateDates.map((candidateDate, index) => ({
    plan_id: plan.id,
    start_at: toIsoDateTime(candidateDate),
    end_at: values.candidateEndDates[index] ? toIsoDateTime(values.candidateEndDates[index]) : null,
    is_all_day: values.candidateAllDays[index] ?? false,
    sort_order: index
  }));

  const shareLink = buildAnswerShareLink(plan.id, values.answer_deadline_at);

  const [{ error: participantsError }, { error: datesError }, { error: linkError }] = await Promise.all([
    participants.length > 0 ? supabase.from("participants").insert(participants) : Promise.resolve({ error: null }),
    supabase.from("candidate_dates").insert(candidateDates),
    supabase.from("share_links").insert(shareLink)
  ]);

  if (participantsError || datesError || linkError) {
    throw new Error(participantsError?.message ?? datesError?.message ?? linkError?.message);
  }

  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  redirect(`/plans/${plan.id}`);
}

export async function updatePlanAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = planSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .update({
      title: values.title,
      answer_deadline_at: values.answer_deadline_at,
      memo: values.memo
    })
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .select("event_id")
    .single();

  if (planError) {
    throw new Error(planError.message);
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

  const [{ error: participantsError }, { error: datesError }] = await Promise.all([
    shouldReplaceParticipants && participants.length > 0
      ? supabase.from("participants").insert(participants)
      : Promise.resolve({ error: null }),
    supabase.from("candidate_dates").insert(candidateDates)
  ]);

  if (participantsError || datesError) {
    throw new Error(participantsError?.message ?? datesError?.message);
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}`);
}
