import React from "react";

import { PaymentMethodField } from "@/components/payment-method-field";
import { Card } from "@/components/ui";

export function SettlementPaymentMethodForm({
  role,
  currentValue,
  action
}: {
  role: "receive" | "pay";
  currentValue: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const label = role === "receive" ? "受け取り方法" : "支払い方法";

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">あなたの{label}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">ここで設定すると、あなたが関わる清算すべてに使われます。</p>
      <form action={action} className="mt-4 grid gap-3">
        <PaymentMethodField defaultValue={currentValue} label={label} />
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
        >
          {label}を保存
        </button>
      </form>
    </Card>
  );
}
