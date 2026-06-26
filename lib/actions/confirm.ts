"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildConfirmationUpdates, pickRecommendedCandidate } from "@/lib/domain/confirmation";
import { requireString } from "@/lib/form-data";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

type AnswerRow = {
  answer: "yes" | "maybe" | "no" | "unanswered";
  participants: { id: string } | { id: string }[] | null;
};

export async function confirmPlanAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const candidateDateId = requireString(formData.get("candidateDateId"), "候補日を選んでください");
  const supabase = await createSupabaseServerClient();
  const { data: candidate, error: candidateError } = await supabase
    .from("candidate_dates")
    .select("id, start_at, end_at, plans(id, event_id, owner_user_id)")
    .eq("id", candidateDateId)
    .eq("plan_id", planId)
    .single();

  if (candidateError || !candidate) {
    throw new Error("候補日が見つかりません");
  }

  const plan = Array.isArray(candidate.plans) ? candidate.plans[0] : candidate.plans;
  if (plan.owner_user_id !== userId) {
    throw new Error("主催者だけが日程を確定できます");
  }

  const { data: answers, error: answersError } = await supabase
    .from("availability_answers")
    .select("answer, participants(id)")
    .eq("candidate_date_id", candidateDateId);

  if (answersError) {
    throw new Error(answersError.message);
  }

  const updates = buildConfirmationUpdates(
    ((answers ?? []) as AnswerRow[]).flatMap((row) => {
      const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants;
      return participant ? [{ participantId: participant.id, answer: row.answer }] : [];
    })
  );

  const { error: planError } = await supabase
    .from("plans")
    .update({
      status: "date_confirmed",
      confirmed_start_at: candidate.start_at,
      confirmed_end_at: candidate.end_at
    })
    .eq("id", planId)
    .eq("owner_user_id", userId);

  if (planError) {
    throw new Error(planError.message);
  }

  await Promise.all(
    updates.map((update) =>
      supabase.from("participants").update({ status: update.status }).eq("id", update.participantId)
    )
  );

  await supabase.from("events").update({ status: "confirmed" }).eq("id", plan.event_id).eq("owner_user_id", userId);

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  redirect(`/plans/${planId}`);
}

export { pickRecommendedCandidate };
