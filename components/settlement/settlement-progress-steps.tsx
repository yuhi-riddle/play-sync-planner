import React from "react";
import { clsx } from "clsx";

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
  const currentStep = isComplete ? "complete" : paymentWaitingCount > 0 ? "payment" : "confirmation";
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

  const activeIndex = steps.findIndex((step) => step.tone === "current");
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;

  return (
    <div className="grid gap-3">
      <ol aria-label="清算の進捗" className="flex items-center">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={step.tone === "current" ? "step" : undefined}
            className="flex flex-1 items-center last:flex-none"
          >
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors",
                step.tone === "current"
                  ? "bg-gradient-to-br from-pine to-pine-deep text-white"
                  : step.tone === "done"
                    ? "bg-mist text-pine"
                    : "border border-line text-muted"
              )}
            >
              <span aria-hidden="true">{index + 1}</span>
              <span className="sr-only">
                {step.label}（{step.countLabel}）
                {step.tone === "current" ? `・現在のステップ：${step.detail}` : step.tone === "done" ? "・完了" : ""}
              </span>
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={clsx("mx-2 h-px flex-1", step.tone === "done" ? "bg-moss/40" : "bg-line")}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {activeStep ? (
        <div>
          <p className="text-sm font-bold text-ink">
            <span className="tabular-nums text-muted">STEP {activeIndex + 1}</span>
            <span className="ml-2">{activeStep.label}</span>
            <span className="ml-2 text-muted">（{activeStep.countLabel}）</span>
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{activeStep.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
