"use client";

import React, { useMemo, useState } from "react";

import { submitAvailabilityAnswersAction } from "@/lib/actions/answers";
import { formatDateTimeRange } from "@/lib/format";
import { TextField } from "@/components/ui";

type CandidateDate = {
  id: string;
  start_at: string;
  end_at: string | null;
};

type AnswerChoice = "yes" | "maybe" | "no";

const choices: Array<{ value: AnswerChoice; label: string; ariaText: string }> = [
  { value: "yes", label: "○ 行ける", ariaText: "行ける" },
  { value: "maybe", label: "△ 調整できるかも", ariaText: "調整できるかも" },
  { value: "no", label: "× 行けない", ariaText: "行けない" }
];

export function AnswerForm({ token, candidateDates }: { token: string; candidateDates: CandidateDate[] }) {
  const action = submitAvailabilityAnswersAction.bind(null, token);
  const [answers, setAnswers] = useState<Record<string, AnswerChoice | undefined>>({});
  const answeredCount = useMemo(
    () => candidateDates.filter((candidate) => answers[candidate.id]).length,
    [answers, candidateDates]
  );
  const allAnswered = candidateDates.length > 0 && answeredCount === candidateDates.length;
  const progressPercent = candidateDates.length === 0 ? 0 : Math.round((answeredCount / candidateDates.length) * 100);

  function setAnswer(candidateId: string, answer: AnswerChoice) {
    setAnswers((current) => ({ ...current, [candidateId]: answer }));
  }

  function applyAll(answer: AnswerChoice) {
    setAnswers(Object.fromEntries(candidateDates.map((candidate) => [candidate.id, answer])));
  }

  return (
    <form action={action} className="grid gap-5">
      <TextField label="名前" name="displayName" required requiredMessage="回答者の名前を入力してください" />
      <div className="rounded-lg border border-white/80 bg-cream/86 p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">回答済み {answeredCount}/{candidateDates.length}</p>
            <p className="mt-1 text-xs leading-5 text-ink/60">候補が多いときは一括入力して、違う日だけ直せます。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink/10 bg-white/84 px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                onClick={() => applyAll(choice.value)}
              >
                全部{choice.label.charAt(0)}
              </button>
            ))}
          </div>
        </div>
        <div
          className="mt-4 h-2 rounded-full bg-white/86"
          aria-label="回答進捗"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={candidateDates.length}
          aria-valuenow={answeredCount}
        >
          <div className="h-full rounded-full bg-moss transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
      <div className="grid gap-4">
        {candidateDates.map((candidate, index) => (
          <fieldset key={candidate.id} className="rounded-lg border border-white/80 bg-white/68 p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              候補{index + 1} {formatDateTimeRange(candidate.start_at, candidate.end_at)}
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {choices.map((choice) => (
                <label key={choice.value} className="flex items-center gap-2 rounded-full border border-ink/10 bg-cream/80 px-3 py-2 text-sm font-semibold">
                  <input
                    type="radio"
                    name={`answer:${candidate.id}`}
                    value={choice.value}
                    required
                    checked={answers[candidate.id] === choice.value}
                    onChange={() => setAnswer(candidate.id, choice.value)}
                    aria-label={`候補${index + 1}に${choice.ariaText}と回答`}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm font-medium text-ink">
              <span>コメント</span>
              <input
                className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                name={`comment:${candidate.id}`}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div>
        <button
          type="submit"
          disabled={!allAnswered}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-ink/35 disabled:text-white/78 disabled:shadow-none"
        >
          回答する
        </button>
      </div>
    </form>
  );
}
