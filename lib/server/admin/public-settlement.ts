import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type PublicSettlementData = {
  linkId: string;
  plan: {
    id: string;
    title: string | null;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    is_all_day: boolean;
    events:
      | { title: string | null; location_name: string | null }
      | Array<{ title: string | null; location_name: string | null }>
      | null;
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
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

  const { data: planId, error } = await supabase.rpc("record_public_settlement_payment", {
    p_share_link_id: link.id,
    p_settlement_id: validatedSettlementId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_url: input.paymentUrl,
    p_memo: input.memo
  });
  const validatedPlanId = typeof planId === "string" ? requirePublicToken(planId) : null;
  if (error || !validatedPlanId || validatedPlanId !== link.plan_id) {
    throw new Error("支払い記録を保存できませんでした");
  }

  return validatedPlanId;
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
