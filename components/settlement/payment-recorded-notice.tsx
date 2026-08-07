import React from "react";
import { CheckCircle2 } from "lucide-react";

export function PaymentRecordedNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-control border border-moss/20 bg-mist/32 p-4"
    >
      <div className="flex gap-3">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-pine" />
        <div>
          <p className="font-bold text-ink">支払い記録を受け付けました</p>
          <p className="mt-1 text-sm leading-6 text-muted">主催者が受け取り確認をすると、清算済みに変わります。</p>
          <p className="mt-1 text-sm leading-6 text-muted">必要なら、このページをあとで開き直して確認できます。</p>
        </div>
      </div>
    </div>
  );
}
