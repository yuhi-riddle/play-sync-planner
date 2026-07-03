import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ExpenseForm } from "@/components/expense-form";
import { PaymentMethodField } from "@/components/payment-method-field";
import { PaymentDestinationLink } from "@/components/payment-destination-link";
import { ShareLinkCard } from "@/components/share-link-card";
import { SettlementCompletionNotice } from "@/components/settlement-completion-notice";
import { SettlementConfirmationQueue } from "@/components/settlement-confirmation-queue";
import { SettlementProgressSteps } from "@/components/settlement-progress-steps";
import { SettlementReminderCard } from "@/components/settlement-reminder-card";
import { Card, EmptyState, MadoiForm, PageHeader, SecondaryLink } from "@/components/ui";
import {
  confirmSettlementPaymentAction,
  createExpenseAction,
  deleteExpenseAction,
  markSettlementReminderSentAction,
  recordSettlementPaymentAction,
  updateSettlementPaymentInstructionAction,
  updateExpenseAction
} from "@/lib/actions/settlements";
import {
  buildSettlementConfirmationRequestMessage,
  buildSettlementPaymentRequestMessage,
  getPaymentInstructionView,
  summarizeSettlementNextActions,
  summarizeSettlementOverview,
  summarizeSettlementPaymentProgress,
  type SettlementNextActionItem,
  type SettlementPaymentProgress
} from "@/lib/domain/settlement";
import { buildPublicSettlementUrl } from "@/lib/domain/plans";
import { summarizeSettlementReminderLogs, type SettlementReminderLogView } from "@/lib/domain/reminder-log";
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
  recipient_names: string[] | null;
  reminder_message: string | null;
  reminder_type: "payment_request" | "confirmation_request" | "other" | null;
};

type ShareLinkRow = {
  token: string;
  purpose: string;
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
      "id, title, owner_user_id, events(id, title), share_links(token, purpose), participants(id, display_name, status), expenses(id, title, amount, paid_at, memo, payment_method, payment_url, is_important, payer_participant_id, payer:participants!expenses_payer_participant_id_fkey(id, display_name), expense_splits(id, participant_id, amount, participants(id, display_name))), settlements(id, amount, status, payment_method, payment_url, memo, paid_at, confirmed_at, from_participant:participants!settlements_from_participant_id_fkey(id, display_name), to_participant:participants!settlements_to_participant_id_fkey(id, display_name), settlement_payments(id, amount, payment_method, payment_url, memo, paid_at, confirmed_at, paid_by:participants!settlement_payments_paid_by_participant_id_fkey(id, display_name))), settlement_reminder_logs(sent_at, recipient_names, reminder_message, reminder_type)"
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
  const reminderLogSummary = summarizeSettlementReminderLogs(reminderLogs);
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const ownerSettlementUrl = `${origin.replace(/\/$/, "")}/plans/${plan.id}/settlement`;
  const answerShareLink = ((plan.share_links ?? []) as ShareLinkRow[]).find((link) => link.purpose === "answer");
  const publicSettlementUrl = answerShareLink ? buildPublicSettlementUrl(origin, answerShareLink.token) : null;
  const createExpense = createExpenseAction.bind(null, plan.id);
  const markReminderSent = markSettlementReminderSentAction.bind(null, plan.id);
  const unpaidSettlements = settlements.filter((settlement) => settlementProgress(settlement).remainingAmount > 0);
  const hasMissingPaymentInstructions = unpaidSettlements.some((settlement) => !settlement.payment_method && !settlement.payment_url);
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
  const settlementNextActions = summarizeSettlementNextActions(
    settlements.map((settlement) => ({
      fromName: participantName(settlement.from_participant),
      toName: participantName(settlement.to_participant),
      amount: settlement.amount,
      payments: (settlement.settlement_payments ?? []).map((payment) => ({
        amount: payment.amount,
        confirmedAt: payment.confirmed_at
      }))
    }))
  );
  const paymentRequestMessage = buildSettlementPaymentRequestMessage({
    title: event?.title,
    publicSettlementUrl,
    requests: settlements.map((settlement) => {
      const progress = settlementProgress(settlement);
      return {
        fromName: participantName(settlement.from_participant),
        toName: participantName(settlement.to_participant),
        remainingAmount: progress.remainingAmount,
        paymentMethod: settlement.payment_method,
        paymentUrl: settlement.payment_url,
        memo: settlement.memo
      };
    })
  });
  const confirmationRequestMessage = buildSettlementConfirmationRequestMessage({
    title: event?.title,
    settlementUrl: ownerSettlementUrl,
    requests: settlementNextActions.confirmationWaiting
  });
  const confirmationQueueItems = settlements
    .flatMap((settlement) =>
      (settlement.settlement_payments ?? [])
        .filter((payment) => !payment.confirmed_at)
        .map((payment) => ({
          id: payment.id,
          fromName: participantName(payment.paid_by) || participantName(settlement.from_participant),
          toName: participantName(settlement.to_participant),
          amount: payment.amount,
          paidAt: payment.paid_at,
          paymentMethod: payment.payment_method,
          paymentUrl: payment.payment_url,
          memo: payment.memo
        }))
    )
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="支払い・清算"
        description={event?.title ? `${event.title} の支払いと清算をまとめます。` : "支払いと清算をまとめます。"}
        action={<SecondaryLink href={`/plans/${plan.id}`}>日程調整に戻る</SecondaryLink>}
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

      <Card>
        <h2 className="text-lg font-semibold text-ink">清算の進捗</h2>
        <p className="mt-1 text-sm leading-6 text-ink/60">今どこで止まっているかを確認します。</p>
        <div className="mt-5">
          <SettlementProgressSteps
            paymentWaitingCount={settlementNextActions.paymentWaiting.length}
            confirmationWaitingCount={settlementNextActions.confirmationWaiting.length}
            isComplete={settlementNextActions.isComplete}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">次にやること</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">支払い待ちと、受け取り確認待ちを分けて見ます。</p>
          </div>
          {settlementNextActions.isComplete ? (
            <span className="inline-flex self-start rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">清算完了</span>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <NextActionList
            title="支払い待ち"
            emptyText="支払い待ちはありません。"
            items={settlementNextActions.paymentWaiting}
            description={(item) => `${item.participantName}さん → ${item.counterpartyName}さんへ ${formatYen(item.amount)}`}
          />
          <NextActionList
            title="受け取り確認待ち"
            emptyText="確認待ちはありません。"
            items={settlementNextActions.confirmationWaiting}
            description={(item) => `${item.participantName}さんが ${item.counterpartyName}さんの支払い ${formatYen(item.amount)} を確認`}
          />
        </div>
      </Card>

      <SettlementCompletionNotice isComplete={settlementNextActions.isComplete} settlementCount={settlementOverview.settlementCount} />

      <SettlementConfirmationQueue items={confirmationQueueItems} confirmPaymentAction={confirmSettlementPaymentAction} />

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
          <h2 className="text-lg font-semibold text-ink">参加者向け清算リンク</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">参加者はこのリンクから支払い先を確認し、支払い記録を残せます。</p>
          <div className="mt-5">
            <ShareLinkCard shareUrl={publicSettlementUrl} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">支払い依頼文面</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">残額と支払い先をまとめてコピーできます。送信は普段使う連絡手段で行います。</p>
          {hasMissingPaymentInstructions ? (
            <p className="mt-3 rounded-lg border border-honey/35 bg-honey/14 p-3 text-sm leading-6 text-ink/70">
              受け取り方法が未設定の清算があります。必要なら「清算結果」で送金先を入力してから文面をコピーしてください。
            </p>
          ) : null}
          <div className="mt-5">
            {paymentRequestMessage ? (
              <SettlementReminderCard
                recipientNames={[...new Set(unpaidSettlements.map((settlement) => participantName(settlement.from_participant)))]}
                message={paymentRequestMessage}
                reminderType="payment_request"
                markSentAction={markReminderSent}
                latestSentAt={reminderLogSummary.latestPaymentRequestSentAt}
                sentCount={reminderLogSummary.paymentRequestCount}
                textareaLabel="支払い依頼文面"
                markSentLabel="依頼済みに記録"
              />
            ) : (
              <EmptyState>未払いの清算はありません。</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">受け取り確認依頼文面</h2>
          <p className="mt-1 text-sm leading-6 text-ink/60">支払い記録がある人に、受け取り確認をお願いする文面です。</p>
          <div className="mt-5">
            {confirmationRequestMessage ? (
              <SettlementReminderCard
                recipientNames={[...new Set(settlementNextActions.confirmationWaiting.map((item) => item.participantName))]}
                message={confirmationRequestMessage}
                reminderType="confirmation_request"
                markSentAction={markReminderSent}
                latestSentAt={reminderLogSummary.latestConfirmationRequestSentAt}
                sentCount={reminderLogSummary.confirmationRequestCount}
                textareaLabel="受け取り確認依頼文面"
                markSentLabel="確認依頼済みに記録"
                emptyText="確認待ちはありません。"
              />
            ) : (
              <EmptyState>確認待ちはありません。</EmptyState>
            )}
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-semibold text-ink">送信記録</h2>
        <p className="mt-1 text-sm leading-6 text-ink/60">支払い依頼と確認依頼を分けて確認できます。</p>
        <div className="mt-5">
          {reminderLogSummary.recentLogs.length > 0 ? (
            <div className="grid gap-2">
              {reminderLogSummary.recentLogs.slice(0, 6).map((log) => (
                <SettlementReminderLogItem key={`${log.sentAt}-${log.label}-${log.recipientNames.join(",")}`} log={log} />
              ))}
            </div>
          ) : (
            <EmptyState>送信記録はまだありません。</EmptyState>
          )}
        </div>
      </Card>

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
          <p className="mt-1 text-sm leading-6 text-ink/60">入力ミスがあれば、支払った金額を記録する前にここで直せます。</p>
        )}
        <div className="mt-5 grid gap-3">
          {expenses.length > 0 ? (
            expenses.map((expense) => {
              const paymentView = getPaymentInstructionView(expense.payment_method, expense.payment_url);
              return (
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
                    {expense.payment_url ? <PaymentDestinationLink href={expense.payment_url} label="支払い・購入ページを開く" detail={paymentView.detail} className="mt-3" /> : null}
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
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-ink/10 bg-white/78 px-3 py-1 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
                        内容を編集
                      </summary>
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
            );
            })
          ) : (
            <EmptyState>支払い履歴はまだありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function NextActionList({
  title,
  emptyText,
  items,
  description
}: {
  title: string;
  emptyText: string;
  items: SettlementNextActionItem[];
  description: (item: SettlementNextActionItem) => string;
}) {
  return (
    <div className="rounded-lg border border-white/75 bg-white/58 p-4">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {items.map((item) => (
            <li key={`${item.participantName}-${item.counterpartyName}-${item.amount}`} className="rounded-lg border border-ink/8 bg-cream/68 px-3 py-2 text-sm leading-6 text-ink/72">
              {description(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-moss/24 bg-cream/54 px-3 py-2 text-sm text-ink/58">{emptyText}</p>
      )}
    </div>
  );
}

function SettlementReminderLogItem({ log }: { log: SettlementReminderLogView }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/75 bg-white/58 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">{log.label}</span>
        <span className="text-sm font-medium text-ink">
          {log.recipientNames.length > 0 ? log.recipientNames.join("、") : "宛先未記録"}
        </span>
      </div>
      <span className="text-xs text-ink/58">{formatDateTime(log.sentAt)}</span>
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

function SettlementActions({ settlement, progress }: { settlement: SettlementRow; progress: SettlementPaymentProgress }) {
  const instructionView = getPaymentInstructionView(settlement.payment_method, settlement.payment_url);

  return (
    <div className="grid w-full min-w-0 gap-3 md:min-w-72">
      {progress.status === "confirmed" ? <span className="justify-self-start rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">完了</span> : null}

      <div className="rounded-lg border border-white/75 bg-white/58 p-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">支払い先</p>
        <p className="mt-2 text-sm font-bold text-ink">{instructionView.methodLabel}</p>
        <PaymentDestinationLink href={settlement.payment_url} label={instructionView.linkLabel} detail={instructionView.detail} className="mt-2" />
        {settlement.memo ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink/60">メモ: {settlement.memo}</p> : null}
      </div>

      <details className="rounded-lg border border-ink/10 bg-cream/70 p-3">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-ink/10 bg-white/78 px-3 py-1 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
          受け取り方法を設定
        </summary>
        <form action={updateSettlementPaymentInstructionAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
          <PaymentMethodField defaultValue={settlement.payment_method} compact />
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">送金先URL</span>
            <input
              name="payment_url"
              defaultValue={settlement.payment_url ?? ""}
              className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              placeholder="https://..."
            />
          </label>
          <label className="text-sm font-medium text-ink">
            <span className="text-ink/72">メモ</span>
            <textarea
              name="memo"
              rows={2}
              defaultValue={settlement.memo ?? ""}
              className="mt-2 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              placeholder="例: 送金後に連絡ください"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            受け取り方法を保存
          </button>
        </form>
      </details>

      {progress.remainingAmount > 0 ? (
        <details className="rounded-lg border border-ink/10 bg-cream/70 p-3">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-ink/10 bg-white/78 px-3 py-1 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
            支払った金額を記録
          </summary>
          <MadoiForm action={recordSettlementPaymentAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
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
                data-field-label="支払い金額"
                data-required-message="支払い金額を入力してください"
                className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
              />
            </label>
            <PaymentMethodField placeholder="例: PayPay" compact />
            <label className="text-sm font-medium text-ink">
              <span className="text-ink/72">支払い記録URL</span>
              <input
                name="payment_url"
                className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
                placeholder="送金履歴や控えのURLがあれば"
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
          </MadoiForm>
        </details>
      ) : null}

      {(settlement.settlement_payments ?? []).length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-white/75 bg-white/58 p-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">支払い履歴</p>
          {[...(settlement.settlement_payments ?? [])]
            .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
            .map((payment) => {
              const paymentView = getPaymentInstructionView(payment.payment_method, payment.payment_url);
              return (
              <div key={payment.id} className="grid gap-2 rounded-lg border border-ink/8 bg-cream/60 p-3 text-sm text-ink/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{formatYen(payment.amount)}</span>
                  <span className="text-xs">{payment.confirmed_at ? `確認済み ${formatDateTime(payment.confirmed_at)}` : `記録 ${formatDateTime(payment.paid_at)}`}</span>
                </div>
                {[payment.payment_method, payment.memo].filter(Boolean).length > 0 ? (
                  <p className="leading-6">{[payment.payment_method, payment.memo].filter(Boolean).join(" / ")}</p>
                ) : null}
                {payment.payment_url ? (
                  <PaymentDestinationLink href={payment.payment_url} label="支払い記録を開く" detail={paymentView.detail} className="mt-1" />
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
            );
            })}
        </div>
      ) : null}
    </div>
  );
}
