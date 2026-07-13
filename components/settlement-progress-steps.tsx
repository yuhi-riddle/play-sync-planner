import React from "react";
import { CheckCircle2, Circle, Clock3 } from "lucide-react";

type StepTone = "current" | "done" | "waiting";

type Step = {
  label: string;
  countLabel: string;
  detail: string;
  tone: StepTone;
};

export function SettlementProgressSteps({
  paymentWaitingCount,
  confirmationWaitingCount,
  isComplete
}: {
  paymentWaitingCount: number;
  confirmationWaitingCount: number;
  isComplete: boolean;
}) {
  const currentStep = isComplete ? "complete" : confirmationWaitingCount > 0 ? "confirmation" : "payment";
  const steps: Step[] = [
    {
      label: "支払い待ち",
      countLabel: `${paymentWaitingCount}件`,
      detail: paymentWaitingCount > 0 ? "参加者の支払いを待っています。" : "支払い待ちはありません。",
      tone: currentStep === "payment" ? "current" : "done"
    },
    {
      label: "受け取り確認待ち",
      countLabel: `${confirmationWaitingCount}件`,
      detail: confirmationWaitingCount > 0 ? "主催者の受け取り確認待ちです。" : "確認待ちはありません。",
      tone: currentStep === "confirmation" ? "current" : currentStep === "complete" ? "done" : "waiting"
    },
    {
      label: "完了",
      countLabel: isComplete ? "3/3" : "未完了",
      detail: isComplete ? "すべての支払い確認が終わっています。" : "全員の支払い確認が終わると完了します。",
      tone: currentStep === "complete" ? "current" : "waiting"
    }
  ];

  return (
    <ol aria-label="清算の進捗" className="grid gap-3 md:grid-cols-3">
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.tone === "current" ? "step" : undefined}
          className={`rounded-control border p-4 ${toneClassNames[step.tone]}`}
        >
          <div className="flex items-start gap-3">
            <StepIcon tone={step.tone} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-ink">{step.label}</p>
                <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">{step.countLabel}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{step.detail}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const toneClassNames: Record<StepTone, string> = {
  current: "border-moss/32 bg-mist/42",
  done: "border-moss/20 bg-surface",
  waiting: "border-line bg-surface"
};

function StepIcon({ tone }: { tone: StepTone }) {
  if (tone === "done") {
    return <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-pine" />;
  }

  if (tone === "current") {
    return <Clock3 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-clay-ink" />;
  }

  return <Circle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />;
}
