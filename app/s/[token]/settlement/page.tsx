import { notFound } from "next/navigation";

import {
  PublicSettlementSummary,
  type PublicSettlementExpense,
  type PublicSettlementItem
} from "@/components/public-settlement-summary";
import { PaymentRecordedNotice } from "@/components/payment-recorded-notice";
import { SetupPanel } from "@/components/state-panels";
import { Card, PageHeader } from "@/components/ui";
import { recordPublicSettlementPaymentAction } from "@/lib/actions/settlements";
import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantRelation = { display_name: string } | { display_name: string }[] | null;

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
  payment_method: string | null;
  payment_url: string | null;
  memo: string | null;
  from_participant: ParticipantRelation;
  to_participant: ParticipantRelation;
  settlement_payments?: Array<{ amount: number; confirmed_at: string | null }>;
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
  searchParams?: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  if (!hasSupabaseAdminEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="支払い・清算" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: link } = await supabase
    .from("share_links")
    .select(
      "token, plans(id, title, events(title), expenses(id, title, amount, memo, is_important, payer:participants!expenses_payer_participant_id_fkey(display_name)), settlements(id, amount, payment_method, payment_url, memo, from_participant:participants!settlements_from_participant_id_fkey(display_name), to_participant:participants!settlements_to_participant_id_fkey(display_name), settlement_payments(amount, confirmed_at)))"
    )
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (!link) {
    notFound();
  }

  const plan = Array.isArray(link.plans) ? link.plans[0] : link.plans;
  if (!plan) {
    notFound();
  }

  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const expenses = ((plan.expenses ?? []) as PublicExpenseRow[]).map<PublicSettlementExpense>((expense) => ({
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    payerName: participantName(expense.payer),
    memo: expense.memo,
    isImportant: Boolean(expense.is_important)
  }));
  const settlements = ((plan.settlements ?? []) as PublicSettlementRow[]).map<PublicSettlementItem>((settlement) => ({
    id: settlement.id,
    fromName: participantName(settlement.from_participant),
    toName: participantName(settlement.to_participant),
    amount: settlement.amount,
    paymentMethod: settlement.payment_method,
    paymentUrl: settlement.payment_url,
    memo: settlement.memo,
    payments: (settlement.settlement_payments ?? []).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="支払い・清算"
        description="共有された予定の立替内容と、支払い先を確認できます。"
      />
      {query.paid === "1" ? <PaymentRecordedNotice /> : null}
      {expenses.length === 0 && settlements.length === 0 ? (
        <Card>
          <p className="text-sm leading-6 text-ink/70">まだ清算内容は登録されていません。</p>
        </Card>
      ) : (
        <PublicSettlementSummary
          eventTitle={event?.title ?? "予定"}
          planTitle={plan.title}
          expenses={expenses}
          settlements={settlements}
          recordPaymentAction={recordPublicSettlementPaymentAction.bind(null, token)}
        />
      )}
    </div>
  );
}
