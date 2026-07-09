"use client";

import { Copy, ExternalLink } from "lucide-react";
import React, { useState } from "react";

function formatYen(amount: number) {
  return amount.toLocaleString("ja-JP");
}

export function isPayPayMethod(paymentMethod: string | null | undefined) {
  return /paypay/i.test(paymentMethod?.trim() ?? "");
}

export function PayPayActionPanel({
  amount,
  className = ""
}: {
  amount: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const amountText = String(amount);

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(amountText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function openPayPay() {
    window.location.href = "paypay://";
  }

  return (
    <div className={`rounded-lg border border-moss/18 bg-mist/28 p-3 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">PayPay</p>
      <p className="mt-1 text-sm leading-6 text-ink/66">金額をコピーしてから、PayPayアプリで支払います。</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={copyAmount}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
        >
          <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
          {copied ? "コピーしました" : `${formatYen(amount)}円をコピー`}
        </button>
        <button
          type="button"
          onClick={openPayPay}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
        >
          <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />
          PayPayを開く
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink/50">スマホのPayPayアプリがある場合に開きます。</p>
    </div>
  );
}
