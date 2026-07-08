"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildEqualExpenseSplits,
  calculateSettlementTransfers,
  summarizeSettlementPaymentProgress,
  validateIndividualSplits
} from "@/lib/domain/settlement";
import { buildNotificationCandidate } from "@/lib/domain/site-notifications";
import { canConfirmSettlementPayment } from "@/lib/domain/participant-identity";
import { formDataToObject } from "@/lib/form-data";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
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

type SettlementPaymentRow = {
  id?: string;
  amount: number;
  confirmed_at: string | null;
};

type NotificationParticipantRelation =
  | { display_name: string | null; user_id?: string | null }
  | Array<{ display_name: string | null; user_id?: string | null }>
  | null;

function firstNotificationParticipant(value: NotificationParticipantRelation) {
  return Array.isArray(value) ? value[0] : value;
}

function notificationParticipantName(value: NotificationParticipantRelation) {
  return firstNotificationParticipant(value)?.display_name?.trim() || "参加者";
}

function notificationPlanTitle(plan: { title?: string | null; events?: { title: string | null } | { title: string | null }[] | null }) {
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  return [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" / ") || "日程調整";
}

async function notifySettlementConfirmationDue({
  settlementId,
  paymentId
}: {
  settlementId: string;
  paymentId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: settlement, error } = await admin
    .from("settlements")
    .select(
      "id, plan_id, plans(title, events(title)), from_participant:participants!settlements_from_participant_id_fkey(display_name), to_participant:participants!settlements_to_participant_id_fkey(display_name, user_id)"
    )
    .eq("id", settlementId)
    .single();

  if (error || !settlement) {
    return;
  }

  const receiver = firstNotificationParticipant(settlement.to_participant as NotificationParticipantRelation);
  if (!receiver?.user_id) {
    return;
  }

  const plan = Array.isArray(settlement.plans) ? settlement.plans[0] : settlement.plans;
  const candidate = buildNotificationCandidate({
    userId: receiver.user_id,
    kind: "confirmation_due",
    planId: settlement.plan_id,
    title: notificationPlanTitle(plan ?? {}),
    href: `/plans/${settlement.plan_id}/settlement#confirmation`,
    dueAt: `payment:${paymentId}`,
    participantNames: [notificationParticipantName(settlement.from_participant as NotificationParticipantRelation)]
  });

  await admin.from("notifications").upsert(
    {
      user_id: candidate.userId,
      kind: candidate.kind,
      title: candidate.title,
      body: candidate.body,
      href: candidate.href,
      dedupe_key: candidate.dedupeKey
    },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
  );
}

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
    throw new Error(error.message);
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
    throw new Error(lockedError.message);
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
    throw new Error(updateError.message);
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
    throw new Error(splitsError.message);
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
    throw new Error(deleteError.message);
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
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, amount, settlement_payments(amount, confirmed_at), plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが支払い記録を追加できます");
  }

  const currentProgress = summarizeSettlementPaymentProgress(
    settlement.amount,
    ((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );

  if (values.amount > currentProgress.remainingAmount) {
    throw new Error("支払い金額が残額を超えています");
  }

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlementId,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: values.payment_method,
      payment_url: values.payment_url,
      memo: values.memo
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const nextProgress = summarizeSettlementPaymentProgress(settlement.amount, [
    ...((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    })),
    { amount: values.amount, confirmedAt: null }
  ]);

  await supabase
    .from("settlements")
    .update({
      status: nextProgress.status === "paid" || nextProgress.status === "confirmed" ? nextProgress.status : "unpaid",
      paid_at: nextProgress.paidAmount > 0 ? new Date().toISOString() : null
    })
    .eq("id", settlementId);

  await supabase.from("plans").update({ settlement_status: "settling" }).eq("id", settlement.plan_id);
  if (insertedPayment?.id) {
    await notifySettlementConfirmationDue({ settlementId, paymentId: insertedPayment.id });
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}

export async function recordPublicSettlementPaymentAction(token: string, settlementId: string, formData: FormData) {
  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  const supabase = createSupabaseAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, amount, settlement_payments(amount, confirmed_at)")
    .eq("id", settlementId)
    .eq("plan_id", link.plan_id)
    .single();

  if (error || !settlement) {
    throw new Error("清算内容が見つかりません");
  }

  const currentProgress = summarizeSettlementPaymentProgress(
    settlement.amount,
    ((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );

  if (values.amount > currentProgress.remainingAmount) {
    throw new Error("支払い金額が残額を超えています");
  }

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlement.id,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: values.payment_method,
      payment_url: values.payment_url,
      memo: values.memo
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const nextProgress = summarizeSettlementPaymentProgress(settlement.amount, [
    ...((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    })),
    { amount: values.amount, confirmedAt: null }
  ]);

  await supabase
    .from("settlements")
    .update({
      status: nextProgress.status === "paid" || nextProgress.status === "confirmed" ? nextProgress.status : "unpaid",
      paid_at: nextProgress.paidAmount > 0 ? new Date().toISOString() : null
    })
    .eq("id", settlement.id);

  await supabase.from("plans").update({ settlement_status: "settling" }).eq("id", settlement.plan_id);
  if (insertedPayment?.id) {
    await notifySettlementConfirmationDue({ settlementId: settlement.id, paymentId: insertedPayment.id });
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
  revalidatePath(`/s/${token}/settlement`);
  redirect(`/s/${token}/settlement?paid=1`);
}

export async function confirmSettlementPaymentAction(paymentId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = createSupabaseAdminClient();
  const { data: payment, error } = await supabase
    .from("settlement_payments")
    .select(
      "id, settlement_id, settlements(id, plan_id, amount, to_participant:participants!settlements_to_participant_id_fkey(user_id), settlement_payments(id, amount, confirmed_at), plans(owner_user_id))"
    )
    .eq("id", paymentId)
    .single();

  const settlement = Array.isArray(payment?.settlements) ? payment?.settlements[0] : payment?.settlements;
  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  const receiver = Array.isArray(settlement?.to_participant) ? settlement?.to_participant[0] : settlement?.to_participant;
  if (
    error ||
    !payment ||
    !settlement ||
    !plan ||
    !canConfirmSettlementPayment({ currentUserId: userId, receiverUserId: receiver?.user_id ?? null })
  ) {
    throw new Error("主催者だけが受け取り確認できます");
  }

  const confirmedAt = new Date().toISOString();
  const { error: updatePaymentError } = await supabase
    .from("settlement_payments")
    .update({ confirmed_at: confirmedAt })
    .eq("id", paymentId);

  if (updatePaymentError) {
    throw new Error(updatePaymentError.message);
  }

  const payments = ((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((row) => ({
    id: row.id,
    amount: row.amount,
    confirmedAt: row.id === paymentId ? confirmedAt : row.confirmed_at
  }));
  const nextProgress = summarizeSettlementPaymentProgress(settlement.amount, payments);

  await supabase
    .from("settlements")
    .update({
      status: nextProgress.status === "paid" || nextProgress.status === "confirmed" ? nextProgress.status : "unpaid",
      confirmed_at: nextProgress.status === "confirmed" ? confirmedAt : null
    })
    .eq("id", settlement.id);

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

  await supabase
    .from("notifications")
    .update({ read_at: confirmedAt })
    .eq("user_id", userId)
    .eq("dedupe_key", `confirmation_due:${settlement.plan_id}:payment:${paymentId}`)
    .is("read_at", null);

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
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
    throw new Error(updateError.message);
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
    throw new Error(error.message);
  }

  revalidatePath(`/plans/${planId}/settlement`);
}
