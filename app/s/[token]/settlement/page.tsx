import { notFound } from "next/navigation";

import {
  PublicSettlementSummary,
  type PublicSettlementExpense,
  type PublicSettlementItem
} from "@/components/settlement/public-settlement-summary";
import { CalendarShareLink } from "@/components/calendar/calendar-share-link";
import { PaymentRecordedNotice } from "@/components/settlement/payment-recorded-notice";
import { SetupPanel } from "@/components/ui/state-panels";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  recordPublicSettlementPaymentAction,
  updatePublicParticipantSettlementPaymentMethodAction
} from "@/lib/actions/settlements";
import { buildGoogleCalendarShareUrl } from "@/lib/domain/calendar/calendar-sync";
import { resolveParticipantSettlementRole } from "@/lib/domain/settlement/settlement";
import { resolveViewerParticipant } from "@/lib/domain/plan/participant-identity";
import { formatDateTimeRange } from "@/lib/shared/format";
import { createSupabaseAdminClient, getCurrentUserId, hasSupabaseAdminEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantRelation =
  | { id: string; display_name: string; user_id: string | null; settlement_payment_method: string | null }
  | { id: string; display_name: string; user_id: string | null; settlement_payment_method: string | null }[]
  | null;

type PublicExpenseRow = {
  id: string;
  title: string;
  amount: number;
  memo: string | null;
  is_important: boolean;
  payer: ParticipantRelation;
};

type PublicSettlementRow = {
  id: string;
  amount: number;
  payment_url: string | null;
  memo: string | null;
  from_participant: ParticipantRelation;
  to_participant: ParticipantRelation;
  settlement_payments?: Array<{ amount: number; confirmed_at: string | null }>;
};

type PublicParticipantRow = {
  id: string;
  display_name: string;
  user_id: string | null;
  settlement_payment_method: string | null;
};

type PublicPlanRow = {
  id: string;
  title: string | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  is_all_day: boolean;
  events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
  participants?: PublicParticipantRow[];
  expenses?: PublicExpenseRow[];
  settlements?: PublicSettlementRow[];
};

function firstParticipant(value: ParticipantRelation) {
  return Array.isArray(value) ? value[0] : value;
}

function participantName(value: ParticipantRelation) {
  return firstParticipant(value)?.display_name ?? "不明な参加者";
}

export default async function PublicSettlementPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ paid?: string; viewer?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  if (!hasSupabaseAdminEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Settlement" title="支払い・清算" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: link } = await supabase
    .from("share_links")
    .select(
      "token, status, plans(id, title, confirmed_start_at, confirmed_end_at, is_all_day, events(title, location_name), participants(id, display_name, user_id, settlement_payment_method), expenses(id, title, amount, memo, is_important, payer:participants!expenses_payer_participant_id_fkey(display_name)), settlements(id, amount, payment_url, memo, from_participant:participants!settlements_from_participant_id_fkey(id, display_name, user_id, settlement_payment_method), to_participant:participants!settlements_to_participant_id_fkey(id, display_name, user_id, settlement_payment_method), settlement_payments(amount, confirmed_at)))"
    )
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (!link) {
    notFound();
  }

  if (link.status === "revoked") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Settlement" title="支払い・清算" />
        <Card>
          <EmptyState>このリンクは無効化されています。主催者に新しいリンクを確認してください。</EmptyState>
        </Card>
      </div>
    );
  }

  const plan = (Array.isArray(link.plans) ? link.plans[0] : link.plans) as PublicPlanRow | null;
  if (!plan) {
    notFound();
  }

  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const calendarShareUrl =
    plan.confirmed_start_at && plan.confirmed_end_at
      ? buildGoogleCalendarShareUrl({
          title: [event?.title, plan.title].map((value) => value?.trim()).filter(Boolean).join(" - ") || "Madoiの日程調整",
          location: event?.location_name,
          start: plan.confirmed_start_at,
          end: plan.confirmed_end_at
        })
      : null;
  const expenses = ((plan.expenses ?? []) as PublicExpenseRow[]).map<PublicSettlementExpense>((expense) => ({
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    payerName: participantName(expense.payer),
    memo: expense.memo,
    isImportant: Boolean(expense.is_important)
  }));

  const currentUserId = await getCurrentUserId();

  const participants = (plan.participants ?? []) as PublicParticipantRow[];
  const viewerParticipant = resolveViewerParticipant({
    participants: participants.map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      userId: participant.user_id
    })),
    userId: currentUserId,
    selectedParticipantId: query.viewer ?? null
  });

  const settlements = ((plan.settlements ?? []) as PublicSettlementRow[]).map<PublicSettlementItem>((settlement) => ({
    id: settlement.id,
    fromParticipantId: firstParticipant(settlement.from_participant)?.id ?? "",
    toParticipantId: firstParticipant(settlement.to_participant)?.id ?? "",
    fromName: participantName(settlement.from_participant),
    toName: participantName(settlement.to_participant),
    amount: settlement.amount,
    paymentMethod: firstParticipant(settlement.to_participant)?.settlement_payment_method ?? null,
    paymentUrl: settlement.payment_url,
    memo: settlement.memo,
    payments: (settlement.settlement_payments ?? []).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  }));

  const viewerRole = viewerParticipant
    ? resolveParticipantSettlementRole(
        viewerParticipant.id,
        settlements.map((settlement) => ({
          fromParticipantId: settlement.fromParticipantId,
          toParticipantId: settlement.toParticipantId
        }))
      )
    : null;

  const viewerProp =
    viewerParticipant && viewerRole
      ? {
          role: viewerRole,
          currentValue:
            participants.find((participant) => participant.id === viewerParticipant.id)?.settlement_payment_method ?? null,
          action: updatePublicParticipantSettlementPaymentMethodAction.bind(null, token, viewerParticipant.id)
        }
      : !viewerParticipant && participants.length > 0
        ? {
            unresolvedParticipants: participants.map((participant) => ({
              id: participant.id,
              displayName: participant.display_name
            }))
          }
        : undefined;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settlement"
        title="支払い・清算"
        description="共有された日程調整の立替内容と、支払い先を確認できます。"
      />
      {query.paid === "1" ? <PaymentRecordedNotice /> : null}
      {calendarShareUrl ? (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">確定した日程</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at, Boolean(plan.is_all_day))}
              </p>
            </div>
            <CalendarShareLink href={calendarShareUrl} />
          </div>
        </Card>
      ) : null}
      {expenses.length === 0 && settlements.length === 0 ? (
        <Card>
          <p className="text-sm leading-6 text-muted">まだ清算内容は登録されていません。</p>
        </Card>
      ) : (
        <PublicSettlementSummary
          eventTitle={event?.title ?? "イベント"}
          planTitle={plan.title}
          expenses={expenses}
          settlements={settlements}
          recordPaymentAction={recordPublicSettlementPaymentAction.bind(null, token)}
          viewer={viewerProp}
        />
      )}
    </div>
  );
}
