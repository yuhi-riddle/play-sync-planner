import { notFound, redirect } from "next/navigation";

import { ExpenseForm } from "@/components/expense-form";
import { SettlementReminderCard } from "@/components/settlement-reminder-card";
import { Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import {
  confirmSettlementPaymentAction,
  createExpenseAction,
  deleteExpenseAction,
  markSettlementReminderSentAction,
  recordSettlementPaymentAction,
  updateExpenseAction
} from "@/lib/actions/settlements";
import {
  summarizeSettlementOverview,
  summarizeSettlementPaymentProgress,
  type SettlementPaymentProgress
} from "@/lib/domain/settlement";
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
  is_important: boolean;
  payer_participant_id: string;
  payer: ParticipantRelation;
  expense_splits: Array<{
    id: string;
    participant_id: string;
    amount: number;
    participants: ParticipantRelation;
  }>;
};

type SettlementPaymentRow = {
  id: string;
  amount: number;
  payment_method: string | null;
  payment_url: string | null;
  memo: string | null;
  paid_at: string;
  confirmed_at: string | null;
  paid_by: ParticipantRelation;
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
  settlement_payments: SettlementPaymentRow[];
};

type ReminderLogRow = {
  sent_at: string;
};

const settlementStatusLabels: Record<SettlementPaymentProgress["status"], string> = {
  unpaid: "未払い",
  partially_paid: "一部支払い済み",
  paid: "支払い済み",
  confirmed: "受け取り確認済み"
};

function firstParticipant(value: ParticipantRelation) {
  return Array.isArray(value) ? value[0] : value;
}

function participantName(value: ParticipantRelation) {
  return firstParticipant(value)?.display_name ?? "不明な参加者";
}

function settlementProgress(settlement: SettlementRow) {
  return summarizeSettlementPaymentProgress(
    settlement.amount,
    (settlement.settlement_payments ?? []).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );
}

function buildSettlementReminderMessage(settlements: SettlementRow[]) {
  const unpaid = settlements
    .map((settlement) => ({
      settlement,
      progress: settlementProgress(settlement)
    }))
    .filter(({ progress }) => progress.remainingAmount > 0);

  if (unpaid.length === 0) {
    return "";
  }

  return [
    "清算のお願いです。",
    "",
    ...unpaid.map(
      ({ settlement, progress }) =>
        `${participantName(settlement.from_participant)} → ${participantName(settlement.to_participant)}: ${formatYen(progress.remainingAmount)}`
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
      "id, title, owner_user_id, events(id, title), participants(id, display_name, status), expenses(id, title, amount, paid_at, memo, payment_method, payment_url, is_important, payer_participant_id, payer:participants!expenses_payer_participant_id_fkey(id, display_name), expense_splits(id, participant_id, amount, participants(id, display_name))), settlements(id, amount, status, payment_method, payment_url, memo, paid_at, confirmed_at, from_participant:participants!settlements_from_participant_id_fkey(id, display_name), to_participant:participants!settlements_to_participant_id_fkey(id, display_name), settlement_payments(id, amount, payment_method, payment_url, memo, paid_at, confirmed_at, paid_by:participants!settlement_payments_paid_by_participant_id_fkey(id, display_name))), settlement_reminder_logs(sent_at)"
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
    const statusOrder = { unpaid: 0, partially_paid: 1, paid: 2, confirmed: 3 };
    return (
      statusOrder[settlementProgress(a).status] - statusOrder[settlementProgress(b).status] ||
      participantName(a.from_participant).localeCompare(participantName(b.from_participant), "ja")
    );
  });
  const reminderLogs = ((plan.settlement_reminder_logs ?? []) as ReminderLogRow[]).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const createExpense = createExpenseAction.bind(null, plan.id);
  const markReminderSent = markSettlementReminderSentAction.bind(null, plan.id);
  const unpaidSettlements = settlements.filter((settlement) => settlementProgress(settlement).remainingAmount > 0);
  const settlementPaymentCount = settlements.reduce((total, settlement) => total + (settlement.settlement_payments ?? []).length, 0);
  const settlementOverview = summarizeSettlementOverview(
    settlements.map((settlement) => ({
      amount: settlement.amount,
      payments: (settlement.settlement_payments ?? []).map((payment) => ({
        amount: payment.amount,
        confirmedAt: payment.confirmed_at
      }))
    }))
  );
  const reminderMessage = buildSettlementReminderMessage(settlements);

  return (
    <div className="space-y-6">
      <PageHeader
        title="清算"
        description={event?.title ? `${event.title} の支払いと清算をまとめます。` : "支払いと清算をまとめます。"}
        action={<SecondaryLink href={`/plans/${plan.id}`}>日程調整へ戻る</SecondaryLink>}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryTile label="立替合計" value={formatYen(expenses.reduce((total, expense) => total + expense.amount, 0))} detail={`${expenses.length}件の支払い履歴`} />
        <SummaryTile label="清算残額" value={formatYen(settlementOverview.remainingAmount)} detail={unpaidSettlements.length > 0 ? `${unpaidSettlements.length}件の支払い待ち` : "清算済みです"} />
        <SummaryTile
          label="支払い済み"
          value={formatYen(settlementOverview.paidAmount)}
          detail={`確認済み ${formatYen(settlementOverview.confirmedAmount)}`}
        />
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
            settlements.map((settlement) => {
              const progress = settlementProgress(settlement);
              return (
                <article key={settlement.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {participantName(settlement.from_participant)} → {participantName(settlement.to_participant)}
                      </p>
                      <p className="mt-2 text-2xl font-bold text-ink">{formatYen(settlement.amount)}</p>
                      <p className="mt-1 text-sm text-ink/60">
                        {settlementStatusLabels[progress.status]} / 支払い済み {formatYen(progress.paidAmount)} / 残り {formatYen(progress.remainingAmount)}
                      </p>
                      {progress.confirmedAmount > 0 ? <p className="mt-1 text-sm text-ink/60">受け取り確認済み {formatYen(progress.confirmedAmount)}</p> : null}
                      {settlement.amount > 0 ? (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/72">
                          <div
                            className="h-full rounded-full bg-moss"
                            style={{ width: `${Math.min(100, Math.round((progress.paidAmount / settlement.amount) * 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <SettlementActions settlement={settlement} progress={progress} />
                  </div>
                </article>
              );
            })
          ) : (
            <EmptyState>支払いを追加すると、ここに「誰が誰へいくら払うか」が表示されます。</EmptyState>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">支払い履歴</h2>
        {settlementPaymentCount > 0 ? (
          <p className="mt-1 text-sm leading-6 text-ink/60">清算支払いが始まっているため、立替支払いの編集と削除はロックしています。</p>
        ) : (
          <p className="mt-1 text-sm leading-6 text-ink/60">入力ミスがあれば、清算支払いを記録する前にここで直せます。</p>
        )}
        <div className="mt-5 grid gap-3">
          {expenses.length > 0 ? (
            expenses.map((expense) => (
              <article key={expense.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-ink">{expense.title}</p>
                    {expense.is_important ? (
                      <p className="mt-2 inline-flex rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay">重要メモ</p>
                    ) : null}
                    <p className="mt-1 text-sm text-ink/60">
                      {participantName(expense.payer)} が支払い / {formatDateTime(expense.paid_at)}
                    </p>
                    {expense.memo ? (
                      <p className={expense.is_important ? "mt-3 rounded-lg border border-clay/22 bg-white/75 p-3 text-sm leading-6 text-ink" : "mt-3 text-sm leading-6 text-ink/62"}>
                        {expense.memo}
                      </p>
                    ) : null}
                    {expense.payment_url ? <PaymentLink href={expense.payment_url} label="支払い・購入ページを開く" /> : null}
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
                {settlementPaymentCount === 0 ? (
                  <div className="mt-4 flex flex-col gap-3 border-t border-white/75 pt-4">
                    <details className="rounded-lg border border-ink/10 bg-cream/70 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-ink">内容を編集</summary>
                      <div className="mt-4">
                        <ExpenseForm
                          participants={participants.map((participant) => ({
                            id: participant.id,
                            displayName: participant.display_name
                          }))}
                          action={updateExpenseAction.bind(null, expense.id)}
                          initialValues={{
                            title: expense.title,
                            amount: expense.amount,
                            payerParticipantId: expense.payer_participant_id,
                            memo: expense.memo,
                            paymentMethod: expense.payment_method,
                            paymentUrl: expense.payment_url,
                            isImportant: expense.is_important,
                            splitMode: "individual",
                            splitParticipantIds: expense.expense_splits.map((split) => split.participant_id),
                            individualAmounts: Object.fromEntries(expense.expense_splits.map((split) => [split.participant_id, split.amount]))
                          }}
                          submitLabel="変更を保存"
                        />
                      </div>
                    </details>
                    <form action={deleteExpenseAction.bind(null, expense.id)}>
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-clay/45 bg-white/80 px-4 py-2 text-sm font-bold text-clay transition-colors hover:bg-clay hover:text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                      >
                        この支払いを削除
                      </button>
                    </form>
                  </div>
                ) : null}
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

function PaymentLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="mt-3 inline-flex min-h-9 items-center justify-center rounded-full border border-moss/28 bg-white/82 px-4 py-1 text-xs font-bold text-pine transition-colors hover:border-pine hover:bg-mist/45 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

function SettlementActions({ settlement, progress }: { settlement: SettlementRow; progress: SettlementPaymentProgress }) {
  return (
    <div className="grid min-w-72 gap-3">
      {progress.status === "confirmed" ? <span className="justify-self-start rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">完了</span> : null}

      {progress.remainingAmount > 0 ? (
        <details className="rounded-lg border border-ink/10 bg-cream/70 p-3">
          <summary className="cursor-pointer text-sm font-bold text-ink">清算支払いを記録</summary>
          <form action={recordSettlementPaymentAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
            <label className="text-sm font-medium text-ink">
              <span className="text-ink/72">支払い金額</span>
              <input
                name="amount"
                type="number"
                min={1}
                max={progress.remainingAmount}
                step={1}
                defaultValue={progress.remainingAmount}
                required
                className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              />
            </label>
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
              支払いを記録
            </button>
          </form>
        </details>
      ) : null}

      {(settlement.settlement_payments ?? []).length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-white/75 bg-white/58 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">支払い履歴</p>
          {[...(settlement.settlement_payments ?? [])]
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
            .map((payment) => (
              <div key={payment.id} className="grid gap-2 rounded-lg border border-ink/8 bg-cream/60 p-3 text-sm text-ink/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{formatYen(payment.amount)}</span>
                  <span className="text-xs">{payment.confirmed_at ? `確認済み ${formatDateTime(payment.confirmed_at)}` : `記録 ${formatDateTime(payment.paid_at)}`}</span>
                </div>
                {[payment.payment_method, payment.memo].filter(Boolean).length > 0 ? (
                  <p className="leading-6">{[payment.payment_method, payment.memo].filter(Boolean).join(" / ")}</p>
                ) : null}
                {payment.payment_url ? (
                  <PaymentLink href={payment.payment_url} label="支払い先を開く" />
                ) : null}
                {!payment.confirmed_at ? (
                  <form action={confirmSettlementPaymentAction.bind(null, payment.id)}>
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-3 py-1 text-xs font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                    >
                      受け取り確認
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
