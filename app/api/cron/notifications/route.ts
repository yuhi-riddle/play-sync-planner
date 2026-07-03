import { NextRequest, NextResponse } from "next/server";

import { buildNotificationCandidate, type NotificationCandidateInput } from "@/lib/domain/site-notifications";
import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

type ParticipantRow = {
  display_name: string | null;
  status: string | null;
};

type SettlementPaymentRow = {
  amount: number | null;
  confirmed_at: string | null;
};

type SettlementRow = {
  amount: number | null;
  status: string | null;
  from_participant_id: string | null;
  participants?: { display_name: string | null } | { display_name: string | null }[] | null;
  settlement_payments?: SettlementPaymentRow[];
};

type PlanNotificationRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  status: string;
  settlement_status: string | null;
  answer_deadline_at: string | null;
  events: { title: string | null } | { title: string | null }[] | null;
  participants?: ParticipantRow[];
  settlements?: SettlementRow[];
};

const ANSWER_DEADLINE_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "Supabase admin env is not configured" }, { status: 500 });
  }

  const now = new Date();
  const supabase = createSupabaseAdminClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select(
      "id, owner_user_id, title, status, settlement_status, answer_deadline_at, events(title), participants(display_name, status), settlements(amount, status, from_participant_id, participants!settlements_from_participant_id_fkey(display_name), settlement_payments(amount, confirmed_at))"
    )
    .in("status", ["collecting_answers", "date_confirmed"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((plans ?? []) as PlanNotificationRow[]).flatMap((plan) => buildPlanNotifications(plan, now));

  if (candidates.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  const { error: upsertError } = await supabase.from("notifications").upsert(
    candidates.map((candidate) => ({
      user_id: candidate.userId,
      kind: candidate.kind,
      title: candidate.title,
      body: candidate.body,
      href: candidate.href,
      dedupe_key: candidate.dedupeKey
    })),
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ created: candidates.length });
}

function buildPlanNotifications(plan: PlanNotificationRow, now: Date) {
  const title = planTitle(plan);
  const inputs: NotificationCandidateInput[] = [];

  if (plan.status === "collecting_answers") {
    const pendingNames = (plan.participants ?? [])
      .filter((participant) => participant.status === "invited")
      .map((participant) => participant.display_name ?? "参加者");

    if (pendingNames.length > 0) {
      inputs.push({
        userId: plan.owner_user_id,
        kind: "unanswered",
        planId: plan.id,
        title,
        href: `/plans/${plan.id}`,
        participantNames: pendingNames
      });
    }

    if (isDeadlineNear(plan.answer_deadline_at, now)) {
      inputs.push({
        userId: plan.owner_user_id,
        kind: "answer_deadline",
        planId: plan.id,
        title,
        href: `/plans/${plan.id}`,
        dueAt: plan.answer_deadline_at
      });
    }
  }

  if (plan.status === "date_confirmed" && plan.settlement_status === "needed") {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "settlement_needed",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`
    });
  }

  const unpaidNames = (plan.settlements ?? [])
    .filter((settlement) => settlement.status !== "confirmed" && remainingAmount(settlement) > 0)
    .map((settlement) => participantName(settlement))
    .filter(Boolean);

  if (unpaidNames.length > 0) {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "payment_due",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`,
      participantNames: uniqueNames(unpaidNames)
    });
  }

  const confirmationNames = (plan.settlements ?? [])
    .filter((settlement) => (settlement.settlement_payments ?? []).some((payment) => !payment.confirmed_at))
    .map((settlement) => participantName(settlement))
    .filter(Boolean);

  if (confirmationNames.length > 0) {
    inputs.push({
      userId: plan.owner_user_id,
      kind: "confirmation_due",
      planId: plan.id,
      title,
      href: `/plans/${plan.id}/settlement`,
      participantNames: uniqueNames(confirmationNames)
    });
  }

  return inputs.map(buildNotificationCandidate);
}

function isAuthorized(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  return request.headers.get("user-agent") === "vercel-cron/1.0";
}

function planTitle(plan: PlanNotificationRow) {
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  return [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" / ") || "日程調整";
}

function isDeadlineNear(value: string | null, now: Date) {
  if (!value) {
    return false;
  }

  const dueAt = new Date(value).getTime();
  const current = now.getTime();
  return dueAt >= current && dueAt <= current + ANSWER_DEADLINE_WINDOW_MS;
}

function remainingAmount(settlement: SettlementRow) {
  const total = settlement.amount ?? 0;
  const paid = (settlement.settlement_payments ?? []).reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  return Math.max(total - paid, 0);
}

function participantName(settlement: SettlementRow) {
  const participant = Array.isArray(settlement.participants) ? settlement.participants[0] : settlement.participants;
  return participant?.display_name?.trim() ?? "";
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names));
}
