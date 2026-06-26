"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FormEvent, InvalidEvent } from "react";
import { useState } from "react";

import { SubmitButton, TextArea, TextField } from "@/components/ui";
import { toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  memo?: string | null;
  candidate_dates?: Array<{ start_at: string }>;
};

export function PlanForm({
  action,
  plan,
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
}) {
  const initialCandidateDates = plan?.candidate_dates?.length
    ? plan.candidate_dates.map((candidate) => toDateTimeLocalValue(candidate.start_at))
    : [""];
  const [candidateDates, setCandidateDates] = useState(initialCandidateDates);

  function updateCandidateDate(index: number, value: string) {
    setCandidateDates((current) => current.map((candidateDate, currentIndex) => (currentIndex === index ? value : candidateDate)));
  }

  function addCandidateDate() {
    setCandidateDates((current) => [...current, ""]);
  }

  function removeCandidateDate(index: number) {
    setCandidateDates((current) => (current.length === 1 ? current : current.filter((_, currentIndex) => currentIndex !== index)));
  }

  function handleCandidateInvalid(event: InvalidEvent<HTMLInputElement>) {
    if (event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity("候補日時を選択してください");
    }
  }

  function handleCandidateInput(event: FormEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
  }

  return (
    <form action={action} className="grid gap-6">
      <section className="rounded-lg border border-white/75 bg-white/48 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">候補日時</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">参加できそうな日時を追加します。時間は15分単位です。</p>
          </div>
          <button
            type="button"
            onClick={addCandidateDate}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-cream/88 text-pine transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay"
            aria-label="候補日時を追加"
            title="候補日時を追加"
          >
            <Plus aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {candidateDates.map((candidateDate, index) => (
            <div key={index} className="flex items-end gap-2">
              <label className="flex-1 text-sm font-medium text-ink">
                <span className="text-ink/72">候補{index + 1}</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
                  name="candidateDates"
                  type="datetime-local"
                  value={candidateDate}
                  onChange={(event) => updateCandidateDate(index, event.target.value)}
                  onInvalid={handleCandidateInvalid}
                  onInput={handleCandidateInput}
                  step={900}
                  required={index === 0}
                />
              </label>
              <button
                type="button"
                onClick={() => removeCandidateDate(index)}
                className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white/76 text-ink/60 transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay"
                aria-label={`候補${index + 1}を削除`}
                title="削除"
                disabled={candidateDates.length === 1}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <TextField
        label="回答期限"
        name="answer_deadline_at"
        type="datetime-local"
        defaultValue={toDateTimeLocalValue(plan?.answer_deadline_at)}
        step={900}
        helpText="任意です。設定すると、この日時を過ぎた回答を止めます。"
      />
      <TextArea label="メモ" name="memo" defaultValue={plan?.memo} placeholder="集合場所や補足があれば入力します。" />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
