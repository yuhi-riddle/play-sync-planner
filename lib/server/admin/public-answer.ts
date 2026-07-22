import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type PublicAnswerCandidate = {
  id: string;
  plan_id: string;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
};

export type PublicAnswerParticipant = {
  id: string;
  display_name: string;
  user_id: string | null;
};

export type PublicAnswerData = {
  linkId: string;
  planId: string;
  expiresAt: string | null;
  title: string | null;
  ownerUserId: string;
  answerDeadlineAt: string | null;
  eventTitle: string | null;
  candidates: PublicAnswerCandidate[];
  participants: PublicAnswerParticipant[];
};

type SavePublicAnswerInput = {
  linkId: string;
  planId: string;
  ownerUserId: string;
  title: string;
  participant:
    | {
        kind: "existing";
        id: string;
        userIdToLink: string | null;
      }
    | {
        kind: "new";
        userId: string | null;
        displayName: string;
        participantType: "registered" | "guest";
      };
  displayName: string;
  answers: Array<{
    candidateDateId: string;
    answer: "yes" | "maybe" | "no" | "unanswered";
    comment: string | null;
  }>;
  currentUserId: string | null;
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value;
}

function requireUuid(value: string) {
  return requirePublicToken(value) !== null;
}

function validateSaveInput(input: SavePublicAnswerInput) {
  const participantIds =
    input.participant.kind === "existing"
      ? [input.participant.id, input.participant.userIdToLink]
      : [input.participant.userId];
  if (
    !requireUuid(input.linkId) ||
    !requireUuid(input.planId) ||
    !requireUuid(input.ownerUserId) ||
    (input.currentUserId !== null && !requireUuid(input.currentUserId)) ||
    participantIds.some((id) => id !== null && !requireUuid(id)) ||
    input.displayName.trim().length === 0 ||
    input.displayName.length > 80 ||
    input.title.length > 500 ||
    input.answers.length === 0 ||
    input.answers.length > 50 ||
    new Set(input.answers.map((answer) => answer.candidateDateId)).size !==
      input.answers.length ||
    input.answers.some(
      (answer) =>
        !requireUuid(answer.candidateDateId) ||
        !["yes", "maybe", "no"].includes(answer.answer) ||
        (answer.comment?.length ?? 0) > 1_000
    )
  ) {
    throw new Error("回答の入力内容を確認してください");
  }
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getPublicAnswerData(token: string): Promise<PublicAnswerData | null> {
  const validatedToken = requirePublicToken(token);
  if (!validatedToken) return null;

  const supabase = createSupabaseAdminClient();
  const { data: link, error } = await supabase
    .from("share_links")
    .select(
      "id, plan_id, expires_at, plans(id, title, owner_user_id, answer_deadline_at, events(title), candidate_dates(id, plan_id, start_at, end_at, is_all_day), participants(id, display_name, user_id))"
    )
    .eq("token", validatedToken)
    .eq("purpose", "answer")
    .maybeSingle();

  if (error || !link) return null;
  const plan = firstRelation(link.plans);
  if (!plan) return null;
  const event = firstRelation(plan.events);

  return {
    linkId: link.id,
    planId: link.plan_id,
    expiresAt: link.expires_at,
    title: plan.title,
    ownerUserId: plan.owner_user_id,
    answerDeadlineAt: plan.answer_deadline_at,
    eventTitle: event?.title ?? null,
    candidates: (plan.candidate_dates ?? []) as PublicAnswerCandidate[],
    participants: (plan.participants ?? []) as PublicAnswerParticipant[]
  };
}

export async function savePublicAnswer(input: SavePublicAnswerInput): Promise<string> {
  validateSaveInput(input);
  const supabase = createSupabaseAdminClient();
  const [{ data: link }, { data: candidates }] = await Promise.all([
    supabase
      .from("share_links")
      .select("id, plan_id, plans(owner_user_id)")
      .eq("id", input.linkId)
      .eq("plan_id", input.planId)
      .eq("purpose", "answer")
      .maybeSingle(),
    supabase
      .from("candidate_dates")
      .select("id")
      .eq("plan_id", input.planId)
      .in(
        "id",
        input.answers.map((answer) => answer.candidateDateId)
      )
  ]);
  const plan = link ? firstRelation(link.plans) : null;
  if (
    !link ||
    !plan ||
    plan.owner_user_id !== input.ownerUserId ||
    (candidates ?? []).length !== input.answers.length
  ) {
    throw new Error("回答先を確認できませんでした");
  }

  let participantId: string | null =
    input.participant.kind === "existing" ? input.participant.id : null;

  if (input.participant.kind === "existing") {
    const { data: participant } = await supabase
      .from("participants")
      .select("id")
      .eq("id", input.participant.id)
      .eq("plan_id", input.planId)
      .maybeSingle();
    if (!participant) throw new Error("参加者を確認できませんでした");
  }

  if (input.participant.kind === "new") {
    const { data, error } = await supabase
      .from("participants")
      .insert({
        plan_id: input.planId,
        user_id: input.participant.userId,
        display_name: input.participant.displayName,
        participant_type: input.participant.participantType,
        status: "answered",
        is_organizer: false
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error("参加者を保存できませんでした");
    }
    participantId = data.id;
  }

  if (!participantId) {
    throw new Error("参加者を保存できませんでした");
  }

  const { error: answersError } = await supabase.from("availability_answers").upsert(
    input.answers.map((answer) => ({
      candidate_date_id: answer.candidateDateId,
      participant_id: participantId,
      answer: answer.answer,
      comment: answer.comment
    })),
    { onConflict: "candidate_date_id,participant_id" }
  );
  if (answersError) {
    throw new Error("回答を保存できませんでした");
  }

  const participantUpdate =
    input.participant.kind === "existing" && input.participant.userIdToLink
      ? {
          status: "answered",
          user_id: input.participant.userIdToLink,
          participant_type: "registered"
        }
      : { status: "answered" };
  const { error: participantError } = await supabase
    .from("participants")
    .update(participantUpdate)
    .eq("id", participantId)
    .eq("plan_id", input.planId);
  if (participantError) {
    throw new Error("参加者を保存できませんでした");
  }

  if (input.currentUserId !== input.ownerUserId) {
    const { error: notificationError } = await supabase.from("notifications").upsert(
      {
        user_id: input.ownerUserId,
        kind: "answer_received",
        title: "日程回答が届きました",
        body: `${input.title} に${input.displayName}さんが回答しました。`,
        href: `/plans/${input.planId}`,
        dedupe_key: `answer_received:${input.planId}:${participantId}`
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
    );
    if (notificationError) {
      throw new Error("回答通知を保存できませんでした");
    }
  }

  const { error: auditError } = await supabase.rpc("record_security_audit", {
    operation: "public_answer",
    target_type: "share_link",
    target_id: input.linkId,
    outcome: "success"
  });
  if (auditError) throw new Error("回答の監査記録を保存できませんでした");

  return participantId;
}

export async function consumePublicAnswerRateLimit(
  subjectHash: string
): Promise<SafeRateLimitResult> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("consume_public_rate_limit", {
    operation: "public_answer",
    subject_hash: requireSubjectHash(subjectHash)
  });
  return safeRateLimitResult(error);
}

export async function recordPublicAnswerRateLimitDenial(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.rpc("record_security_audit", {
    operation: "rate_limit_denied",
    target_type: "rate_limit",
    target_id: null,
    outcome: "denied"
  });
}
