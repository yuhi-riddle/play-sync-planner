"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildEqualExpenseSplits,
  calculateSettlementTransfers,
  validateIndividualSplits
} from "@/lib/domain/settlement";
import { formDataToObject } from "@/lib/form-data";
import { recordPublicSettlementPayment } from "@/lib/server/admin/public-settlement";
import {
  consumePublicLimit,
  rateLimitErrorFromDatabase
} from "@/lib/server/rate-limit";
import { normalizePublicToken } from "@/lib/server/request-guards";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import {
  expenseSchema,
  settlementPaymentInstructionSchema,
  settlementPaymentSchema,
  type ExpenseFormValues
} from "@/lib/validators";
import type { SettlementReminderKind } from "@/lib/domain/reminder-log";

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

function settlementReminderTypeFromFormData(value: FormDataEntryValue | null): SettlementReminderKind {
  if (value === "payment_request" || value === "confirmation_request" || value === "other") {
    return value;
  }

  return "other";
}

function assertParticipantIds(participantIds: Set<string>, values: string[]) {
  values.forEach((participantId) => {
    if (!participantIds.has(participantId)) {
      throw new Error("このイベントの参加者だけを選択してください");
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
    throw new Error("立替支払いを読み込めませんでした。");
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
      throw new Error("清算内容を再計算できませんでした。");
    }
  }

  await supabase
    .from("plans")
    .update({ settlement_status: transfers.length > 0 ? "needed" : "not_needed" })
    .eq("id", planId);
}

async function hasSettlementPayments({
  supabase,
  planId
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  planId: string;
}) {
  const { data, error } = await supabase
    .from("settlement_payments")
    .select("id, settlements!inner(plan_id)")
    .eq("settlements.plan_id", planId)
    .limit(1);

  if (error) {
    throw new Error("支払い状況を確認できませんでした。");
  }

  return (data ?? []).length > 0;
}

async function assertExpenseCanChange({
  supabase,
  planId
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  planId: string;
}) {
  if (await hasSettlementPayments({ supabase, planId })) {
    throw new Error("清算支払いが始まっているため、立替支払いは変更できません");
  }

  const { data: lockedSettlements, error: lockedError } = await supabase
    .from("settlements")
    .select("id")
    .eq("plan_id", planId)
    .in("status", ["paid", "confirmed"])
    .limit(1);

  if (lockedError) {
    throw new Error("清算状況を確認できませんでした。");
  }

  if ((lockedSettlements ?? []).length > 0) {
    throw new Error("支払い済みの清算があるため、立替支払いは変更できません");
  }
}

function splitsFromValues(values: ExpenseFormValues) {
  return values.split_mode === "equal"
    ? buildEqualExpenseSplits(values.amount, values.split_participant_ids)
    : validateIndividualSplits(
        values.amount,
        values.individual_participant_ids.map((participantId, index) => ({
          participantId,
          amount: values.individual_split_amounts[index] ?? 0
        }))
      );
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
    throw new Error("支払った人はこのイベントの参加者から選んでください");
  }

  await assertExpenseCanChange({ supabase, planId });

  const splits = splitsFromValues(values);

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
      payment_url: values.payment_url,
      is_important: values.is_important
    })
    .select("id")
    .single();

  if (expenseError) {
    throw new Error("立替支払いを保存できませんでした。");
  }

  const { error: splitsError } = await supabase.from("expense_splits").insert(
    splits.map((split) => ({
      expense_id: expense.id,
      participant_id: split.participantId,
      amount: split.amount
    }))
  );

  if (splitsError) {
    throw new Error("負担額を保存できませんでした。");
  }

  await recomputeSettlements(planId, participants);

  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
  redirect(`/plans/${planId}/settlement`);
}

export async function updateExpenseAction(expenseId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = expenseSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: expense, error } = await supabase
    .from("expenses")
    .select("id, plan_id, plans(owner_user_id, participants(id, display_name))")
    .eq("id", expenseId)
    .single();

  const plan = Array.isArray(expense?.plans) ? expense?.plans[0] : expense?.plans;
  if (error || !expense || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが立替支払いを編集できます");
  }

  await assertExpenseCanChange({ supabase, planId: expense.plan_id });

  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  const participantIds = new Set(participants.map((participant) => participant.id));
  const splits = splitsFromValues(values);

  if (!participantIds.has(values.payer_participant_id)) {
    throw new Error("支払った人はこのイベントの参加者から選んでください");
  }
  assertParticipantIds(participantIds, splits.map((split) => split.participantId));

  const { error: updateError } = await supabase
    .from("expenses")
    .update({
      payer_participant_id: values.payer_participant_id,
      title: values.title,
      amount: values.amount,
      memo: values.memo,
      payment_method: values.payment_method,
      payment_url: values.payment_url,
      is_important: values.is_important
    })
    .eq("id", expenseId);

  if (updateError) {
    throw new Error("立替支払いを更新できませんでした。");
  }

  await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
  const { error: splitsError } = await supabase.from("expense_splits").insert(
    splits.map((split) => ({
      expense_id: expenseId,
      participant_id: split.participantId,
      amount: split.amount
    }))
  );

  if (splitsError) {
    throw new Error("負担額を更新できませんでした。");
  }

  await recomputeSettlements(expense.plan_id, participants);

  revalidatePath(`/plans/${expense.plan_id}`);
  revalidatePath(`/plans/${expense.plan_id}/settlement`);
  redirect(`/plans/${expense.plan_id}/settlement`);
}

export async function deleteExpenseAction(expenseId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense, error } = await supabase
    .from("expenses")
    .select("id, plan_id, plans(owner_user_id, participants(id, display_name))")
    .eq("id", expenseId)
    .single();

  const plan = Array.isArray(expense?.plans) ? expense?.plans[0] : expense?.plans;
  if (error || !expense || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが立替支払いを削除できます");
  }

  await assertExpenseCanChange({ supabase, planId: expense.plan_id });

  const { error: deleteError } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (deleteError) {
    throw new Error("立替支払いを削除できませんでした。");
  }

  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  await recomputeSettlements(expense.plan_id, participants);

  revalidatePath(`/plans/${expense.plan_id}`);
  revalidatePath(`/plans/${expense.plan_id}/settlement`);
  redirect(`/plans/${expense.plan_id}/settlement`);
}

export async function recordSettlementPaymentAction(settlementId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: planId, error } = await supabase.rpc("record_settlement_payment", {
    p_settlement_id: settlementId,
    p_amount: values.amount,
    p_payment_method: values.payment_method,
    p_payment_url: values.payment_url,
    p_memo: values.memo
  });
  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (error?.code === "42501") {
    throw new Error("主催者だけが支払い記録を追加できます。");
  }
  if (error?.code === "22023") throw new Error("支払い金額を確認してください。");
  if (error || !planId) throw new Error("支払い記録を保存できませんでした。");

  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
}

export async function recordPublicSettlementPaymentAction(token: string, settlementId: string, formData: FormData) {
  const normalizedToken = normalizePublicToken(token);
  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  await consumePublicLimit("public_payment", normalizedToken);
  const planId = await recordPublicSettlementPayment({
    token: normalizedToken,
    settlementId,
    amount: values.amount,
    paymentMethod: values.payment_method,
    paymentUrl: values.payment_url,
    memo: values.memo
  });

  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
  revalidatePath(`/s/${normalizedToken}/settlement`);
  redirect(`/s/${normalizedToken}/settlement?paid=1`);
}

export async function confirmSettlementPaymentAction(paymentId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: planId, error } = await supabase.rpc("confirm_settlement_payment", {
    p_payment_id: paymentId
  });
  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (error?.code === "42501") {
    throw new Error("受取人だけが受け取り確認できます。");
  }
  if (error || !planId) throw new Error("受け取り確認を保存できませんでした。");

  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
}

export async function updateSettlementPaymentInstructionAction(settlementId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = settlementPaymentInstructionSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが支払い先メモを編集できます");
  }

  const { error: updateError } = await supabase
    .from("settlements")
    .update({
      payment_method: values.payment_method,
      payment_url: values.payment_url,
      memo: values.memo
    })
    .eq("id", settlementId);

  if (updateError) {
    throw new Error("支払い先メモを更新できませんでした。");
  }

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
  const reminderType = settlementReminderTypeFromFormData(formData.get("reminder_type"));

  const { error } = await supabase.from("settlement_reminder_logs").insert({
    plan_id: planId,
    actor_user_id: userId,
    recipient_names: recipientNames,
    reminder_message: reminderMessage,
    reminder_type: reminderType
  });

  if (error) {
    throw new Error("催促の記録を保存できませんでした。");
  }

  revalidatePath(`/plans/${planId}/settlement`);
}
