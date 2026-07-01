import { notFound, redirect } from "next/navigation";

import { ExpenseForm } from "@/components/expense-form";
import { SettlementReminderCard } from "@/components/settlement-reminder-card";
import { Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import {
  confirmSettlementReceivedAction,
  createExpenseAction,
  markSettlementPaidAction,
  markSettlementReminderSentAction
} from "@/lib/actions/settlements";
import { formatDateTime, formatYen } from "@/lib/format";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantRelation = { id: string; display_name: string } | { id: string; display_name: string }[] | null;

type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
};

type ExpenseRow = {
  id: string;
  title: string;
  amount: number;
  paid_at: string;
  memo: string | null;
  payment_method: string | null;
  payment_url: string | null;
  payer: ParticipantRelation;
  expense_splits: Array<{
    id: string;
    amount: number;
    participants: ParticipantRelation;
  }>;
};

type SettlementRow = {
  id: string;
  amount: number;
  status: "unpaid" | "paid" | "confirmed";
  payment_method: string | null;
  payment_url: string | null;
  memo: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  from_participant: ParticipantRelation;
  to_participant: ParticipantRelation;
};

type ReminderLogRow = {
  sent_at: string;
};

const settlementStatusLabels: Record<SettlementRow["status"], string> = {
  unpaid: "未払い",
  paid: "支払い済み",
  confirmed: "受け取り確認済み"
};

function firstParticipant(value: ParticipantRelation) {
  return Array.isArray(value) ? value[0] : value;
}

function participantName(value: ParticipantRelation) {
  return firstParticipant(value)?.display_name ?? "不明な参加者";
}

function buildSettlementReminderMessage(settlements: SettlementRow[]) {
  const unpaid = settlements.filter((settlement) => settlement.status === "unpaid");
  if (unpaid.length === 0) {
    return "";
  }

  return [
    "清算のお願いです。",
    "",
    ...unpaid.map(
      (settlement) =>
        `${participantName(settlement.from_participant)} → ${participantName(settlement.to_participant)}: ${formatYen(settlement.amount)}`
    ),
    "",
    "支払いが終わったら、Madoi上で支払い済みにしておいてください。"
  ].join("\n");
}

export default async function SettlementPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select(
      "id, title, owner_user_id, events(id, title), participants(id, display_name, status), expenses(id, title, amount, paid_at, memo, payment_method, payment_url, payer:participants!expenses_payer_participant_id_fkey(id, display_name), expense_splits(id, amount, participants(id, display_name))), settlements(id, amount, status, payment_method, payment_url, memo, paid_at, confirmed_at, from_participant:participants!settlements_from_participant_id_fkey(id, display_name), to_participant:participants!settlements_to_participant_id_fkey(id, display_name)), settlement_reminder_logs(sent_at)"
    )
    .eq("id", planId)
    .single();

  if (!plan || plan.owner_user_id !== userId) {
    notFound();
  }

  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  const expenses = ((plan.expenses ?? []) as ExpenseRow[]).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const settlements = ((plan.settlements ?? []) as SettlementRow[]).sort((a, b) => {
    const statusOrder = { unpaid: 0, paid: 1, confirmed: 2 };
    return statusOrder[a.status] - statusOrder[b.status] || participantName(a.from_participant).localeCompare(participantName(b.from_participant), "ja");
  });
  const reminderLogs = ((plan.settlement_reminder_logs ?? []) as ReminderLogRow[]).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const createExpense = createExpenseAction.bind(null, plan.id);
  const markReminderSent = markSettlementReminderSentAction.bind(null, plan.id);
  const unpaidSettlements = settlements.filter((settlement) => settlement.status === "unpaid");
  const reminderMessage = buildSettlementReminderMessage(settlements);

  return (
    <div className="space-y-6">
      <PageHeader
        title="清算"
        description={event?.title ? `${event.title} の支払いと清算をまとめます。` : "支払いと清算をまとめます。"}
        action={<SecondaryLink href={`/plans/${plan.id}`}>日程調整へ戻る</SecondaryLink>}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryTile label="支払い履歴" value={`${expenses.length}件`} detail={`合計 ${formatYen(expenses.reduce((total, expense) => total + expense.amount, 0))}`} />
        <SummaryTile label="未払い" value={`${unpaidSettlements.length}件`} detail={unpaidSettlements.length > 0 ? "リマインドできます" : "清算済みです"} />
        <SummaryTile
          label="参加者"
          value={`${participants.length}人`}
          detail={participants.length > 0 ? "支払い対象にできます" : "共有リンクから参加者を追加してください"}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-semibold text-ink">支払いを追加</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">チケット代や立替分を追加すると、清算結果を自動で出します。</p>
          <div className="mt-5">
            {participants.length > 0 ? (
              <ExpenseForm
                participants={participants.map((participant) => ({
                  id: participant.id,
                  displayName: participant.display_name
                }))}
                action={createExpense}
              />
            ) : (
              <EmptyState>まだ参加者がいません。共有リンクから回答してもらうと、参加者として追加されます。</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">清算リマインド</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">未払いの人に送る文面をコピーして、送ったら記録できます。</p>
          <div className="mt-5">
            {reminderMessage ? (
              <SettlementReminderCard
                recipientNames={[...new Set(unpaidSettlements.map((settlement) => participantName(settlement.from_participant)))]}
                message={reminderMessage}
                markSentAction={markReminderSent}
                latestSentAt={reminderLogs[0]?.sent_at}
                sentCount={reminderLogs.length}
              />
            ) : (
              <EmptyState>未払いの清算はありません。</EmptyState>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-semibold text-ink">清算結果</h2>
        <div className="mt-5 grid gap-3">
          {settlements.length > 0 ? (
            settlements.map((settlement) => (
              <article key={settlement.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink">
                      {participantName(settlement.from_participant)} → {participantName(settlement.to_participant)}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-ink">{formatYen(settlement.amount)}</p>
                    <p className="mt-1 text-sm text-ink/60">
                      {settlementStatusLabels[settlement.status]}
                      {settlement.paid_at ? ` / 支払い: ${formatDateTime(settlement.paid_at)}` : ""}
                      {settlement.confirmed_at ? ` / 確認: ${formatDateTime(settlement.confirmed_at)}` : ""}
                    </p>
                    {settlement.payment_method || settlement.payment_url || settlement.memo ? (
                      <p className="mt-2 text-sm leading-6 text-ink/62">
                        {[settlement.payment_method, settlement.memo].filter(Boolean).join(" / ")}
                        {settlement.payment_url ? (
                          <>
                            {" / "}
                            <a className="font-bold text-pine underline-offset-4 hover:underline" href={settlement.payment_url} target="_blank" rel="noreferrer">
                              支払いURL
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <SettlementActions settlement={settlement} />
                </div>
              </article>
            ))
          ) : (
            <EmptyState>支払いを追加すると、ここに「誰が誰へいくら払うか」が表示されます。</EmptyState>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">支払い履歴</h2>
        <div className="mt-5 grid gap-3">
          {expenses.length > 0 ? (
            expenses.map((expense) => (
              <article key={expense.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-ink">{expense.title}</p>
                    <p className="mt-1 text-sm text-ink/60">
                      {participantName(expense.payer)} が支払い / {formatDateTime(expense.paid_at)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(expense.expense_splits ?? []).map((split) => (
                        <span key={split.id} className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">
                          {participantName(split.participants)} {formatYen(split.amount)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xl font-bold text-ink">{formatYen(expense.amount)}</p>
                </div>
              </article>
            ))
          ) : (
            <EmptyState>支払い履歴はまだありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink/58">{detail}</p>
    </Card>
  );
}

function SettlementActions({ settlement }: { settlement: SettlementRow }) {
  if (settlement.status === "confirmed") {
    return <span className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">完了</span>;
  }

  if (settlement.status === "paid") {
    return (
      <form action={confirmSettlementReceivedAction.bind(null, settlement.id)}>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          受け取り確認
        </button>
      </form>
    );
  }

  return (
    <details className="min-w-64 rounded-lg border border-ink/10 bg-cream/70 p-3">
      <summary className="cursor-pointer text-sm font-bold text-ink">支払い済みにする</summary>
      <form action={markSettlementPaidAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
        <label className="text-sm font-medium text-ink">
          <span className="text-ink/72">支払い方法</span>
          <input
            name="payment_method"
            className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
            placeholder="例: PayPay"
          />
        </label>
        <label className="text-sm font-medium text-ink">
          <span className="text-ink/72">支払いURL</span>
          <input
            name="payment_url"
            className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
            placeholder="https://..."
          />
        </label>
        <label className="text-sm font-medium text-ink">
          <span className="text-ink/72">メモ</span>
          <textarea
            name="memo"
            rows={2}
            className="mt-2 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          記録する
        </button>
      </form>
    </details>
  );
}
