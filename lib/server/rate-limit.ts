import { createHmac } from "node:crypto";

import {
  consumePublicAnswerRateLimit,
  recordPublicAnswerRateLimitDenial
} from "@/lib/server/admin/public-answer";
import {
  consumePublicSettlementRateLimit,
  recordPublicSettlementRateLimitDenial
} from "@/lib/server/admin/public-settlement";
import { requireUser } from "@/lib/server/request-guards";

export type AuthenticatedRateLimitOperation =
  | "event_message_post"
  | "google_availability"
  | "connection_update"
  | "event_invitation_create"
  | "event_invitation_respond"
  | "event_update"
  | "plan_update"
  | "event_member_update"
  | "profile_update"
  | "settlement_update"
  | "google_calendar_update";

export type PublicRateLimitOperation = "public_answer" | "public_payment";

type SafeRateLimitError = {
  code: string;
  retryAfterSeconds: number | null;
};

const RATE_LIMIT_SQLSTATE = "PSP02";
const MIN_HMAC_SECRET_BYTES = 32;

function retryAfterSeconds(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(1, Math.min(60, Math.ceil(parsed)));
}

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfter: unknown) {
    super("リクエストが多すぎます。時間をおいて再試行してください。");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds(retryAfter);
  }
}

export class RateLimitConfigurationError extends Error {
  readonly code = "rate_limit_unavailable";

  constructor() {
    super("回数制限を確認できませんでした。");
    this.name = "RateLimitConfigurationError";
  }
}

export function rateLimitErrorFromDatabase(
  error: { code?: string; details?: unknown } | null | undefined
): RateLimitError | null {
  return error?.code === RATE_LIMIT_SQLSTATE
    ? new RateLimitError(error.details as number)
    : null;
}

async function recordAuthenticatedDenial(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]
) {
  try {
    await supabase.rpc("record_security_audit", {
      operation: "rate_limit_denied",
      target_type: "rate_limit",
      target_id: null,
      outcome: "denied"
    });
  } catch {
    // Rate-limit enforcement must not depend on best-effort audit recording.
  }
}

export async function consumeAuthenticatedLimit(
  operation: AuthenticatedRateLimitOperation
): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("consume_authenticated_rate_limit", {
    operation
  });

  if (!error) return;

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) {
    await recordAuthenticatedDenial(supabase);
    throw rateLimitError;
  }

  throw new RateLimitConfigurationError();
}

function publicSubjectHash(operation: PublicRateLimitOperation, token: string) {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (
    !secret ||
    Buffer.byteLength(secret, "utf8") < MIN_HMAC_SECRET_BYTES ||
    token.length === 0
  ) {
    throw new RateLimitConfigurationError();
  }

  return createHmac("sha256", secret)
    .update(`${operation}:${token}`)
    .digest("hex");
}

async function handlePublicResult(
  result: { error: SafeRateLimitError | null },
  recordDenial: () => Promise<void>
) {
  if (!result.error) return;

  if (result.error.code === RATE_LIMIT_SQLSTATE) {
    try {
      await recordDenial();
    } catch {
      // The limit remains authoritative even if audit recording is unavailable.
    }
    throw new RateLimitError(result.error.retryAfterSeconds);
  }

  throw new RateLimitConfigurationError();
}

export async function consumePublicLimit(
  operation: PublicRateLimitOperation,
  token: string
): Promise<void> {
  const subjectHash = publicSubjectHash(operation, token);

  if (operation === "public_answer") {
    await handlePublicResult(
      await consumePublicAnswerRateLimit(subjectHash),
      recordPublicAnswerRateLimitDenial
    );
    return;
  }

  await handlePublicResult(
    await consumePublicSettlementRateLimit(subjectHash),
    recordPublicSettlementRateLimitDenial
  );
}
