import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { summarizeSettlementPaymentProgress } from "@/lib/domain/settlement";
import {
  buildNotificationCandidate,
  type NotificationCandidate
} from "@/lib/domain/site-notifications";

type ParticipantRelation = { display_name: string | null; user_id?: string | null }
  | Array<{ display_name: string | null; user_id?: string | null }>
  | null;

export type PublicSettlementData = {
  linkId: string;
  plan: {
    id: string;
    title: string | null;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    is_all_day: boolean;
    events: { title: string | null; location_name: string | null } | Array<{ title: string | null; location_name: string | null }> | null;
    expenses?: Array<Record<string, unknown>>;
    settlements?: Array<Record<string, unknown>>;
  };
};

type PublicPaymentInput = {
  token: string;
  settlementId: string;
  amount: number;
  paymentMethod: string | null;
  paymentUrl: string | null;
  memo: string | null;
};

type SafeRateLimitResult = {
  error: {
    code: string;
    retryAfterSeconds: number | null;
  } | null;
};

function safeRateLimitResult(error: { code?: string; details?: string } | null): SafeRateLimitResult {
  if (!error) return { error: null };
  const parsed = Number(error.details);
  return {
    error: {
      code: error.code ?? "rate_limit_unavailable",
      retryAfterSeconds: Number.isFinite(parsed) ? parsed : null
    }
  };
}

function requireSubjectHash(subjectHash: string) {
  if (!/^[0-9a-f]{64}$/i.test(subjectHash)) {
    throw new Error("Invalid rate-limit subject");
  }
  return `\\x${subjectHash.toLowerCase()}`;
}

function requirePublicToken(token: string) {
  const value = token.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getPublicSettlementData(token: string): Promise<PublicSettlementData | null> {
  const validatedToken = requirePublicToken(token);
  if (!validatedToken) return null;

  const supabase = createSupabaseAdminClient();
  const { data: link, error } = await supabase
    .from("share_links")
    .select(
      "id, plans(id, title, confirmed_start_at, confirmed_end_at, is_all_day, events(title, location_name), expenses(id, title, amount, memo, is_important, payer:participants!expenses_payer_participant_id_fkey(display_name)), settlements(id, amount, payment_method, payment_url, memo, from_participant:participants!settlements_from_participant_id_fkey(display_name), to_participant:participants!settlements_to_participant_id_fkey(display_name), settlement_payments(amount, confirmed_at)))"
    )
    .eq("token", validatedToken)
    .eq("purpose", "answer")
    .maybeSingle();
  const plan = link ? firstRelation(link.plans) : null;
  if (error || !link || !plan) return null;

  return {
    linkId: link.id,
    plan: plan as PublicSettlementData["plan"]
  };
}

function participant(value: ParticipantRelation) {
  return firstRelation(value);
}

async function createConfirmationNotification(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  settlementId: string,
  paymentId: string
) {
  const { data: settlement } = await supabase
    .from("settlements")
    .select(
      "plan_id, plans(title, events(title)), from_participant:participants!settlements_from_participant_id_fkey(display_name), to_participant:participants!settlements_to_participant_id_fkey(display_name, user_id)"
    )
    .eq("id", settlementId)
    .maybeSingle();
  if (!settlement) return;

  const receiver = participant(settlement.to_participant as ParticipantRelation);
  if (!receiver?.user_id) return;
  const payer = participant(settlement.from_participant as ParticipantRelation);
  const plan = firstRelation(settlement.plans);
  const event = firstRelation(plan?.events ?? null);
  const title = [event?.title, plan?.title].map((value) => value?.trim()).filter(Boolean).join(" / ") || "日程調整";
  const candidate: NotificationCandidate = buildNotificationCandidate({
    userId: receiver.user_id,
    kind: "confirmation_due",
    planId: settlement.plan_id,
    title,
    href: `/plans/${settlement.plan_id}/settlement#confirmation`,
    dueAt: `payment:${paymentId}`,
    participantNames: [payer?.display_name?.trim() || "参加者"]
  });

  await supabase.from("notifications").upsert(
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

export async function recordPublicSettlementPayment(input: PublicPaymentInput): Promise<string> {
  const validatedToken = requirePublicToken(input.token);
  const validatedSettlementId = requirePublicToken(input.settlementId);
  if (
    !validatedToken ||
    !validatedSettlementId ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    (input.paymentMethod?.length ?? 0) > 100 ||
    (input.paymentUrl?.length ?? 0) > 2_048 ||
    (input.memo?.length ?? 0) > 1_000
  ) {
    throw new Error("共有リンクが見つかりません");
  }

  const supabase = createSupabaseAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("id, plan_id")
    .eq("token", validatedToken)
    .eq("purpose", "answer")
    .maybeSingle();
  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, amount, settlement_payments(amount, confirmed_at)")
    .eq("id", validatedSettlementId)
    .eq("plan_id", link.plan_id)
    .maybeSingle();
  if (error || !settlement) {
    throw new Error("清算内容が見つかりません");
  }

  const payments = settlement.settlement_payments ?? [];
  const progress = summarizeSettlementPaymentProgress(
    settlement.amount,
    payments.map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );
  if (input.amount > progress.remainingAmount) {
    throw new Error("支払い金額が残額を超えています");
  }

  const { data: payment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlement.id,
      paid_by_participant_id: settlement.from_participant_id,
      amount: input.amount,
      payment_method: input.paymentMethod,
      payment_url: input.paymentUrl,
      memo: input.memo
    })
    .select("id")
    .single();
  if (insertError || !payment) {
    throw new Error("支払い記録を保存できませんでした");
  }

  const next = summarizeSettlementPaymentProgress(settlement.amount, [
    ...payments.map((row) => ({
      amount: row.amount,
      confirmedAt: row.confirmed_at
    })),
    { amount: input.amount, confirmedAt: null }
  ]);
  const { error: updateError } = await supabase
    .from("settlements")
    .update({
      status: next.status === "paid" || next.status === "confirmed" ? next.status : "unpaid",
      paid_at: next.paidAmount > 0 ? new Date().toISOString() : null
    })
    .eq("id", settlement.id);
  if (updateError) {
    throw new Error("支払い記録を保存できませんでした");
  }

  const { error: planError } = await supabase
    .from("plans")
    .update({ settlement_status: "settling" })
    .eq("id", settlement.plan_id);
  if (planError) throw new Error("支払い記録を保存できませんでした");
  await createConfirmationNotification(supabase, settlement.id, payment.id);
  const { error: auditError } = await supabase.rpc("record_security_audit", {
    operation: "public_payment",
    target_type: "settlement",
    target_id: settlement.id,
    outcome: "success"
  });
  if (auditError) throw new Error("支払いの監査記録を保存できませんでした");

  return settlement.plan_id;
}

export async function consumePublicSettlementRateLimit(
  subjectHash: string
): Promise<SafeRateLimitResult> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("consume_public_rate_limit", {
    operation: "public_payment",
    subject_hash: requireSubjectHash(subjectHash)
  });
  return safeRateLimitResult(error);
}

export async function recordPublicSettlementRateLimitDenial(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.rpc("record_security_audit", {
    operation: "rate_limit_denied",
    target_type: "rate_limit",
    target_id: null,
    outcome: "denied"
  });
}
