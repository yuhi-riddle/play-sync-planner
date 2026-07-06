import React from "react";

import { PaymentMethodField } from "@/components/payment-method-field";
import { isPayPayMethod, PayPayActionPanel } from "@/components/paypay-action-panel";
import { PaymentDestinationLink } from "@/components/payment-destination-link";
import { SettlementProgressSteps } from "@/components/settlement-progress-steps";
import { Card, EmptyState, MadoiForm } from "@/components/ui";
import { getPaymentInstructionView, summarizeSettlementNextActions, summarizeSettlementOverview, summarizeSettlementPaymentProgress } from "@/lib/domain/settlement";

export type PublicSettlementExpense = {
  id: string;
  title: string;
  amount: number;
  payerName: string;
  memo: string | null;
  isImportant: boolean;
};

export type PublicSettlementItem = {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  paymentMethod: string | null;
  paymentUrl: string | null;
  memo: string | null;
  payments: Array<{ amount: number; confirmedAt: string | null }>;
};

export function PublicSettlementSummary({
  eventTitle,
  planTitle,
  expenses,
  settlements,
  recordPaymentAction
}: {
  eventTitle: string;
  planTitle: string | null;
  expenses: PublicSettlementExpense[];
  settlements: PublicSettlementItem[];
  recordPaymentAction?: (settlementId: string, formData: FormData) => void | Promise<void>;
}) {
  const overview = summarizeSettlementOverview(
    settlements.map((settlement) => ({
      amount: settlement.amount,
      payments: settlement.payments
    }))
  );
  const unpaidSettlements = settlements.filter((settlement) => summarizeSettlementPaymentProgress(settlement.amount, settlement.payments).remainingAmount > 0);
  const settlementNextActions = summarizeSettlementNextActions(
    settlements.map((settlement) => ({
      fromName: settlement.fromName,
      toName: settlement.toName,
      amount: settlement.amount,
      payments: settlement.payments
    }))
  );

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss">予定</p>
        <h2 className="mt-2 text-2xl font-bold text-ink">{eventTitle}</h2>
        {planTitle ? <p className="mt-1 text-sm text-ink/60">{planTitle}</p> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryItem label="清算残額" value={formatYenText(overview.remainingAmount)} />
          <SummaryItem label="支払い済み" value={formatYenText(overview.paidAmount)} />
          <SummaryItem label="立替合計" value={formatYenText(expenses.reduce((total, expense) => total + expense.amount, 0))} />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">清算の進捗</h2>
        <p className="mt-1 text-sm leading-6 text-ink/60">支払いと受け取り確認の状況を確認できます。</p>
        <div className="mt-5">
          <SettlementProgressSteps
            paymentWaitingCount={settlementNextActions.paymentWaiting.length}
            confirmationWaitingCount={settlementNextActions.confirmationWaiting.length}
            isComplete={settlementNextActions.isComplete}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">支払い先</h2>
        <div className="mt-4 grid gap-3">
          {unpaidSettlements.length > 0 ? (
            unpaidSettlements.map((settlement) => {
              const progress = summarizeSettlementPaymentProgress(settlement.amount, settlement.payments);
              const paymentView = getPaymentInstructionView(settlement.paymentMethod, settlement.paymentUrl);
              return (
                <article key={settlement.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold text-ink">
                        {settlement.fromName} → {settlement.toName}
                      </p>
                      <p className="mt-1 text-sm text-ink/60">
                        残り {formatYenText(progress.remainingAmount)}
                      </p>
                      <p className="mt-3 text-sm text-ink/70">支払い方法: {paymentView.methodLabel}</p>
                      <p className="mt-1 text-sm text-ink/58">{paymentView.detail}</p>
                      {settlement.memo ? <p className="mt-1 text-sm text-ink/70">メモ: {settlement.memo}</p> : null}
                    </div>
                    {settlement.paymentUrl ? <PaymentDestinationLink href={settlement.paymentUrl} label={paymentView.linkLabel} /> : null}
                    {isPayPayMethod(settlement.paymentMethod) ? (
                      <PayPayActionPanel amount={progress.remainingAmount} className="mt-3" />
                    ) : null}
                  </div>
                  {recordPaymentAction ? (
                    <details open className="mt-4 rounded-lg border border-ink/10 bg-cream/70 p-3">
                      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-ink/10 bg-white/78 px-3 py-1 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
                        支払いを記録
                      </summary>
                      <MadoiForm action={recordPaymentAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
                        <label className="text-sm font-medium text-ink">
                          <span className="text-ink/72">支払い金額</span>
                          <span id={`${settlement.id}-payment-amount-help`} className="mt-1 block text-xs leading-5 text-ink/58">
                            一部だけ支払った場合は、支払った金額に変更できます。残り {formatYenText(progress.remainingAmount)}です。
                          </span>
                          <input
                            name="amount"
                            type="number"
                            min={1}
                            max={progress.remainingAmount}
                            step={1}
                            defaultValue={progress.remainingAmount}
                            aria-describedby={`${settlement.id}-payment-amount-help`}
                            inputMode="numeric"
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
                </article>
              );
            })
          ) : (
            <EmptyState>未払いの清算はありません。</EmptyState>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">立替内容</h2>
        <div className="mt-4 grid gap-3">
          {expenses.length > 0 ? (
            expenses.map((expense) => (
              <article key={expense.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold text-ink">{expense.title}</p>
                    {expense.isImportant ? <p className="mt-2 inline-flex rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay">重要メモ</p> : null}
                    <p className="mt-2 text-sm text-ink/60">{expense.payerName} が支払い</p>
                    {expense.memo ? <p className="mt-3 whitespace-pre-wrap rounded-lg border border-white/75 bg-cream/72 p-3 text-sm leading-6 text-ink/72">{expense.memo}</p> : null}
                  </div>
                  <p className="text-xl font-bold text-ink">{formatYenText(expense.amount)}</p>
                </div>
              </article>
            ))
          ) : (
            <EmptyState>立替内容はまだありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/75 bg-white/58 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">{label}</p>
      <p className="mt-2 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

function formatYenText(amount: number) {
  return `${amount.toLocaleString("ja-JP")}円`;
}
