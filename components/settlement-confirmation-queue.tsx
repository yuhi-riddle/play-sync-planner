import React from "react";

import { PaymentDestinationLink } from "@/components/payment-destination-link";
import { Card, EmptyState } from "@/components/ui";

export type SettlementConfirmationQueueItem = {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  paidAt: string;
  paymentMethod: string | null;
  paymentUrl: string | null;
  memo: string | null;
};

export function SettlementConfirmationQueue({
  items,
  confirmPaymentAction
}: {
  items: SettlementConfirmationQueueItem[];
  confirmPaymentAction: (paymentId: string) => void | Promise<void>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">受け取り確認待ち</h2>
      <p className="mt-1 text-sm leading-6 text-ink/60">支払い記録が入ったものを確認します。</p>
      <div className="mt-5 grid gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={item.id} className="rounded-lg border border-white/75 bg-white/62 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-bold text-ink">
                    {item.fromName}さんから{item.toName}さんへ {formatYenText(item.amount)} の支払い記録があります。
                  </p>
                  <p className="mt-1 text-xs text-ink/54">記録 {formatDateTime(item.paidAt)}</p>
                  {[item.paymentMethod, item.memo].filter(Boolean).length > 0 ? (
                    <p className="mt-3 text-sm leading-6 text-ink/70">{[item.paymentMethod, item.memo].filter(Boolean).join(" / ")}</p>
                  ) : null}
                  {item.paymentUrl ? <PaymentDestinationLink href={item.paymentUrl} label="支払い記録を開く" className="mt-3" /> : null}
                </div>
                <form action={confirmPaymentAction.bind(null, item.id)}>
                  <button
                    type="submit"
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 lg:w-auto"
                  >
                    受け取り確認する
                  </button>
                </form>
              </div>
            </article>
          ))
        ) : (
          <EmptyState>受け取り確認待ちはありません。</EmptyState>
        )}
      </div>
    </Card>
  );
}

function formatYenText(amount: number) {
  return `${amount.toLocaleString("ja-JP")}円`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
