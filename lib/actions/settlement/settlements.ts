"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { errorState, failWith, type ActionState } from "@/lib/domain/shared/action-state";
import {
  buildEqualExpenseSplits,
  calculateSettlementTransfers,
  summarizeSettlementPaymentProgress,
  validateIndividualSplits
} from "@/lib/domain/settlement/settlement";
import { buildNotificationCandidate } from "@/lib/domain/shared/site-notifications";
import { canConfirmSettlementPayment } from "@/lib/domain/plan/participant-identity";
import { formDataToObject } from "@/lib/shared/form-data";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";
import {
  expenseSchema,
  participantSettlementPaymentMethodSchema,
  settlementPaymentInstructionSchema,
  settlementPaymentSchema,
  type ExpenseFormValues
} from "@/lib/shared/validators";
import type { SettlementReminderKind } from "@/lib/domain/settlement/reminder-log";

type SettlementSessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SettlementRateLimitResult = { ok: true } | { ok: false; message: string };

/**
 * 支払い記録・確認の冒頭で呼ぶレート制限ゲート（migration 038）。
 * 決済ロジックそのものはTypeScript側のまま変えず、ここでは「多すぎる操作」だけ弾く。
 */
async function consumeSettlementRateLimit(supabase: SettlementSessionClient): Promise<SettlementRateLimitResult> {
  const { data, error } = await supabase.rpc("consume_authenticated_rate_limit", {
    p_operation: "settlement_update"
  });

  if (error) {
    return { ok: false, message: "操作を確認できませんでした" };
  }

  const result = data as { ok: boolean; error?: string; retry_after_seconds?: number };
  if (!result.ok) {
    return { ok: false, message: "操作が多すぎます。しばらく待ってから再度お試しください。" };
  }

  return { ok: true };
}

/**
 * 支払いの記録・確認が成功したことを監査ログへ残す（migration 038）。
 * ここが失敗しても支払い自体は既に確定しているので、投稿は失敗させない。
 */
async function recordSettlementAudit(
  supabase: SettlementSessionClient,
  operation: "settlement_payment_record" | "settlement_payment_confirm",
  targetId: string
): Promise<void> {
  const { error } = await supabase.rpc("record_authenticated_security_audit", {
    p_operation: operation,
    p_target_type: "payment",
    p_target_id: targetId,
    p_outcome: "success"
  });

  if (error) {
    console.error("監査ログを記録できませんでした", error);
  }
}

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

export async function createExpenseAction(
  planId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const values = parsed.data;

  try {
    const { supabase, participants } = await assertPlanOwner(planId, userId);
    const participantIds = new Set(participants.map((participant) => participant.id));

    if (!participantIds.has(values.payer_participant_id)) {
      return errorState("支払った人はこのイベントの参加者から選んでください");
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
        payment_url: values.payment_url,
        is_important: values.is_important
      })
      .select("id")
      .single();

    if (expenseError) {
      return failWith("立替を登録できませんでした。", expenseError);
    }

    const { error: splitsError } = await supabase.from("expense_splits").insert(
      splits.map((split) => ({
        expense_id: expense.id,
        participant_id: split.participantId,
        amount: split.amount
      }))
    );

    if (splitsError) {
      return failWith("立替を登録できませんでした。", splitsError);
    }

    await recomputeSettlements(planId, participants);

    revalidatePath(`/plans/${planId}`);
    revalidatePath(`/plans/${planId}/settlement`);
    redirect(`/plans/${planId}/settlement`);
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "立替を登録できませんでした。");
  }
}

export async function updateExpenseAction(
  expenseId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const parsed = expenseSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const values = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("id, plan_id, plans(owner_user_id, participants(id, display_name))")
      .eq("id", expenseId)
      .single();

    const plan = Array.isArray(expense?.plans) ? expense?.plans[0] : expense?.plans;
    if (error || !expense || plan?.owner_user_id !== userId) {
      return errorState("主催者だけが立替支払いを編集できます");
    }

    await assertExpenseCanChange({ supabase, planId: expense.plan_id });

    const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "ja")
    );
    const participantIds = new Set(participants.map((participant) => participant.id));
    const splits = splitsFromValues(values);

    if (!participantIds.has(values.payer_participant_id)) {
      return errorState("支払った人はこのイベントの参加者から選んでください");
    }
    assertParticipantIds(participantIds, splits.map((split) => split.participantId));

    const { error: updateError } = await supabase
      .from("expenses")
      .update({
        payer_participant_id: values.payer_participant_id,
        title: values.title,
        amount: values.amount,
        memo: values.memo,
        payment_url: values.payment_url,
        is_important: values.is_important
      })
      .eq("id", expenseId);

    if (updateError) {
      return failWith("立替を更新できませんでした。", updateError);
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
      return failWith("立替を更新できませんでした。", splitsError);
    }

    await recomputeSettlements(expense.plan_id, participants);

    revalidatePath(`/plans/${expense.plan_id}`);
    revalidatePath(`/plans/${expense.plan_id}/settlement`);
    redirect(`/plans/${expense.plan_id}/settlement`);
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState(cause instanceof Error ? cause.message : "立替を更新できませんでした。");
  }
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

  const rateLimit = await consumeSettlementRateLimit(supabase);
  if (!rateLimit.ok) {
    throw new Error(rateLimit.message);
  }

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

  const { data: payer } = await supabase
    .from("participants")
    .select("settlement_payment_method")
    .eq("id", settlement.from_participant_id)
    .single();

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlementId,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: payer?.settlement_payment_method ?? null,
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
    await recordSettlementAudit(supabase, "settlement_payment_record", insertedPayment.id);
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}

export async function recordPublicSettlementPaymentAction(token: string, settlementId: string, formData: FormData) {
  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  // 共有リンクは対象を探すための入口。誰が払ったかはログインしているアカウントで決める。
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) {
    throw new Error("ログインが必要です");
  }

  /*
   * ログイン中の本人としてDBを触る。service role をやめたので、参加者でなければ
   * RLSが行を返さず、払う本人でなければ insert も通らない。下のチェックと二重になる。
   */
  const supabase = await createSupabaseServerClient();

  const rateLimit = await consumeSettlementRateLimit(supabase);
  if (!rateLimit.ok) {
    throw new Error(rateLimit.message);
  }

  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, status")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  if (link.status === "revoked") {
    throw new Error("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
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

  const { data: caller } = await supabase
    .from("participants")
    .select("id")
    .eq("plan_id", link.plan_id)
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (!caller) {
    throw new Error("この清算の参加者ではありません");
  }

  /*
   * 払ったのは from_participant。別人が記録できると、払っていない清算が
   * 支払い済みになり、受け取る側は督促の手がかりを失う。
   */
  if (caller.id !== settlement.from_participant_id) {
    throw new Error("支払う本人だけが記録できます");
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

  const { data: payer } = await supabase
    .from("participants")
    .select("settlement_payment_method")
    .eq("id", settlement.from_participant_id)
    .single();

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlement.id,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: payer?.settlement_payment_method ?? null,
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

  /*
   * plans は参加者に update させない。RLSでは列を絞れないので、開くと他の項目まで
   * 書き換えられてしまう。settlement_status だけを動かす関数を呼ぶ。
   */
  await supabase.rpc("mark_plan_settling", { target_plan_id: settlement.plan_id });
  if (insertedPayment?.id) {
    await notifySettlementConfirmationDue({ settlementId: settlement.id, paymentId: insertedPayment.id });
    await recordSettlementAudit(supabase, "settlement_payment_record", insertedPayment.id);
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
  revalidatePath(`/s/${token}/settlement`);
  redirect(`/s/${token}/settlement?paid=1`);
}

export async function updatePublicParticipantSettlementPaymentMethodAction(
  token: string,
  participantId: string,
  formData: FormData
) {
  const values = participantSettlementPaymentMethodSchema.parse(formDataToObject(formData));
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) {
    throw new Error("ログインが必要です");
  }

  /*
   * ログイン中の本人としてDBを触る。service role をやめたので、自分の participants
   * 行以外は RLS が update を通さない。下のチェックと二重になる。
   */
  const supabase = await createSupabaseServerClient();
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, status")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  if (link.status === "revoked") {
    throw new Error("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
  }

  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, plan_id, user_id")
    .eq("id", participantId)
    .eq("plan_id", link.plan_id)
    .single();

  if (error || !participant) {
    throw new Error("参加者が見つかりません");
  }

  /*
   * 支払い先は、その人の受け取り先（PayPay等）。他人が書き換えられると、
   * 攻撃者の口座へ振り込ませられる。トークンを持っていても本人以外は触らせない。
   */
  if (participant.user_id !== currentUserId) {
    throw new Error("本人だけが支払い方法を設定できます");
  }

  const { error: updateError } = await supabase
    .from("participants")
    .update({ settlement_payment_method: values.settlement_payment_method })
    .eq("id", participantId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/s/${token}/settlement`);
}

export async function confirmSettlementPaymentAction(paymentId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  /*
   * レート制限・監査ログのRPCは呼び出し元のセッション（auth.uid()）を見るので、
   * service role の admin クライアントでは auth.uid() が取れず動かない。
   * このゲートだけセッションクライアントで呼び、本体の処理は従来どおり admin で行う。
   */
  const sessionClient = await createSupabaseServerClient();
  const rateLimit = await consumeSettlementRateLimit(sessionClient);
  if (!rateLimit.ok) {
    throw new Error(rateLimit.message);
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

  await recordSettlementAudit(sessionClient, "settlement_payment_confirm", paymentId);

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

export async function updateParticipantSettlementPaymentMethodAction(participantId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = participantSettlementPaymentMethodSchema.parse(formDataToObject(formData));

  const supabase = createSupabaseAdminClient();
  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, plan_id, user_id")
    .eq("id", participantId)
    .single();

  if (error || !participant || participant.user_id !== userId) {
    throw new Error("本人だけが支払い方法を設定できます");
  }

  const { error: updateError } = await supabase
    .from("participants")
    .update({ settlement_payment_method: values.settlement_payment_method })
    .eq("id", participantId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/plans/${participant.plan_id}`);
  revalidatePath(`/plans/${participant.plan_id}/settlement`);
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
