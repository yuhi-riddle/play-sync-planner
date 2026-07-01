"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildEqualExpenseSplits, calculateSettlementTransfers, validateIndividualSplits } from "@/lib/domain/settlement";
import { formDataToObject } from "@/lib/form-data";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import { expenseSchema } from "@/lib/validators";

type ParticipantRow = {
  id: string;
  display_name: string;
};

type ExpenseRow = {
  id: string;
  payer_participant_id: string;
  amount: number;
  expense_splits: Array<{
    participant_id: string;
    amount: number;
  }>;
};

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function namesFromFormData(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function assertParticipantIds(participantIds: Set<string>, values: string[]) {
  values.forEach((participantId) => {
    if (!participantIds.has(participantId)) {
      throw new Error("この予定の参加者だけを選択してください");
    }
  });
}

async function assertPlanOwner(planId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id, owner_user_id, participants(id, display_name)")
    .eq("id", planId)
    .single();

  if (error || !plan || plan.owner_user_id !== userId) {
    throw new Error("主催者だけが清算を編集できます");
  }

  return {
    supabase,
    participants: ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "ja")
    )
  };
}

async function recomputeSettlements(planId: string, participants: ParticipantRow[]) {
  const supabase = await createSupabaseServerClient();
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, payer_participant_id, amount, expense_splits(participant_id, amount)")
    .eq("plan_id", planId);

  if (error) {
    throw new Error(error.message);
  }

  const transfers = calculateSettlementTransfers({
    participants: participants.map((participant) => ({
      id: participant.id,
      displayName: participant.display_name
    })),
    expenses: ((expenses ?? []) as ExpenseRow[]).map((expense) => ({
      id: expense.id,
      payerParticipantId: expense.payer_participant_id,
      amount: expense.amount,
      splits: (expense.expense_splits ?? []).map((split) => ({
        participantId: split.participant_id,
        amount: split.amount
      }))
    }))
  });

  await supabase.from("settlements").delete().eq("plan_id", planId).eq("status", "unpaid");

  if (transfers.length > 0) {
    const { error: insertError } = await supabase.from("settlements").insert(
      transfers.map((transfer) => ({
        plan_id: planId,
        from_participant_id: transfer.fromParticipantId,
        to_participant_id: transfer.toParticipantId,
        amount: transfer.amount,
        status: "unpaid"
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  await supabase
    .from("plans")
    .update({ settlement_status: transfers.length > 0 ? "needed" : "not_needed" })
    .eq("id", planId);
}

export async function createExpenseAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = expenseSchema.parse(formDataToObject(formData));
  const { supabase, participants } = await assertPlanOwner(planId, userId);
  const participantIds = new Set(participants.map((participant) => participant.id));

  if (!participantIds.has(values.payer_participant_id)) {
    throw new Error("支払った人はこの予定の参加者から選んでください");
  }

  const { data: lockedSettlements, error: lockedError } = await supabase
    .from("settlements")
    .select("id")
    .eq("plan_id", planId)
    .in("status", ["paid", "confirmed"])
    .limit(1);

  if (lockedError) {
    throw new Error(lockedError.message);
  }

  if ((lockedSettlements ?? []).length > 0) {
    throw new Error("支払い済みの清算があるため、費用追加はまだできません");
  }

  const splits =
    values.split_mode === "equal"
      ? buildEqualExpenseSplits(values.amount, values.split_participant_ids)
      : validateIndividualSplits(
          values.amount,
          values.individual_participant_ids.map((participantId, index) => ({
            participantId,
            amount: values.individual_split_amounts[index] ?? 0
          }))
        );

  assertParticipantIds(participantIds, splits.map((split) => split.participantId));

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .insert({
      plan_id: planId,
      payer_participant_id: values.payer_participant_id,
      title: values.title,
      amount: values.amount,
      memo: values.memo,
      payment_method: values.payment_method,
      payment_url: values.payment_url
    })
    .select("id")
    .single();

  if (expenseError) {
    throw new Error(expenseError.message);
  }

  const { error: splitsError } = await supabase.from("expense_splits").insert(
    splits.map((split) => ({
      expense_id: expense.id,
      participant_id: split.participantId,
      amount: split.amount
    }))
  );

  if (splitsError) {
    throw new Error(splitsError.message);
  }

  await recomputeSettlements(planId, participants);

  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
  redirect(`/plans/${planId}/settlement`);
}

export async function markSettlementPaidAction(settlementId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが清算を更新できます");
  }

  const paymentMethod = optionalString(formData.get("payment_method"));
  const paymentUrl = optionalString(formData.get("payment_url"));
  const memo = optionalString(formData.get("memo"));

  const { error: updateError } = await supabase
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      payment_url: paymentUrl,
      memo
    })
    .eq("id", settlementId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await supabase.from("payment_proofs").insert({
    settlement_id: settlementId,
    uploaded_by_participant_id: settlement.from_participant_id,
    proof_type: "memo_url",
    proof_url: paymentUrl,
    memo,
    payment_method: paymentMethod
  });

  await supabase.from("plans").update({ settlement_status: "settling" }).eq("id", settlement.plan_id);

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}

export async function confirmSettlementReceivedAction(settlementId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが清算を更新できます");
  }

  const { error: updateError } = await supabase
    .from("settlements")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString()
    })
    .eq("id", settlementId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: openSettlements } = await supabase
    .from("settlements")
    .select("id")
    .eq("plan_id", settlement.plan_id)
    .neq("status", "confirmed")
    .limit(1);

  await supabase
    .from("plans")
    .update({ settlement_status: (openSettlements ?? []).length === 0 ? "settled" : "settling" })
    .eq("id", settlement.plan_id);

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}

export async function markSettlementReminderSentAction(planId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const { supabase } = await assertPlanOwner(planId, userId);
  const recipientNames = namesFromFormData(formData.get("recipient_names"));
  const reminderMessage = optionalString(formData.get("reminder_message"));

  const { error } = await supabase.from("settlement_reminder_logs").insert({
    plan_id: planId,
    actor_user_id: userId,
    recipient_names: recipientNames,
    reminder_message: reminderMessage
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/plans/${planId}/settlement`);
}
