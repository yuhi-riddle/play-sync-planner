import React from "react";
import { CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui";

export function SettlementCompletionNotice({
  isComplete,
  settlementCount
}: {
  isComplete: boolean;
  settlementCount: number;
}) {
  if (!isComplete || settlementCount === 0) {
    return null;
  }

  return (
    <Card className="border-moss/24 bg-mist/36">
      <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-pine" />
        <div>
          <h2 className="text-lg font-semibold text-ink">清算完了</h2>
          <p className="mt-1 text-sm leading-6 text-ink/64">支払いと受け取り確認がすべて完了しています。</p>
        </div>
      </div>
    </Card>
  );
}
