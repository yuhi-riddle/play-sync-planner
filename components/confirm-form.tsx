"use client";

import React, { FormEvent } from "react";

import { confirmPlanAction } from "@/lib/actions/confirm";
import type { CandidateAnswerSummary } from "@/lib/domain/confirmation";
import { formatDateTimeRange } from "@/lib/format";

function AnswerStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-ink/8 bg-cream/72 px-3 py-2 text-center text-sm font-bold" aria-label={`${label} ${value}`}>
      <span className={tone}>{label}</span> <span className="text-ink">{value}</span>
    </div>
  );
}

function progressPercent(candidate: CandidateAnswerSummary) {
  if (candidate.totalParticipants === 0) {
    return 0;
  }

  return Math.round((candidate.answered / candidate.totalParticipants) * 100);
}

export function ConfirmForm({ planId, candidates }: { planId: string; candidates: CandidateAnswerSummary[] }) {
  const action = confirmPlanAction.bind(null, planId);
  const rankedCandidates = [...candidates].sort((a, b) => a.rank - b.rank);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const selectedCandidateId = String(formData.get("candidateDateId") ?? "");
    const selected = rankedCandidates.find((candidate) => candidate.id === selectedCandidateId);

    if (!selected) {
      return;
    }

    const ok = window.confirm(`${formatDateTimeRange(selected.start_at, selected.end_at, Boolean(selected.is_all_day))} で日程を確定します。よろしいですか？`);
    if (!ok) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="grid gap-4">
      <div className="rounded-lg border border-moss/20 bg-mist/24 p-4">
        <p className="text-sm font-bold text-ink">候補を選んで確定します。</p>
        <p className="mt-1 text-sm leading-6 text-ink/64">おすすめ順に並べています。未回答が残っている候補は、確定前に確認してください。</p>
      </div>

      {rankedCandidates.map((candidate) => (
        <label
          key={candidate.id}
          aria-label={`${candidate.rank}位の候補 ${candidate.id}`}
          className="block rounded-lg border border-white/80 bg-white/68 p-4 transition-colors hover:border-moss/45"
        >
          <div className="flex items-start gap-3">
            <input className="mt-1" type="radio" name="candidateDateId" value={candidate.id} required defaultChecked={candidate.recommended} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{candidate.rank}位</span>
                {candidate.recommended ? <span className="rounded-full bg-honey/32 px-3 py-1 text-xs font-bold text-ink">おすすめ</span> : null}
                {candidate.hasPendingAnswers ? <span className="rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay">未回答あり</span> : null}
                <span className="rounded-full bg-mist/42 px-3 py-1 text-xs font-bold text-pine">スコア {candidate.score}</span>
              </div>

              <p className="mt-3 text-base font-bold text-ink">{formatDateTimeRange(candidate.start_at, candidate.end_at, Boolean(candidate.is_all_day))}</p>
              <p className="mt-1 text-sm text-ink/60">
                回答済み {candidate.answered}/{candidate.totalParticipants}人
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <AnswerStat label="○" value={candidate.yes} tone="text-pine" />
                <AnswerStat label="△" value={candidate.maybe} tone="text-moss" />
                <AnswerStat label="×" value={candidate.no} tone="text-clay" />
                <AnswerStat label="未" value={candidate.unanswered} tone="text-ink/55" />
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8" aria-label={`回答率 ${progressPercent(candidate)}%`}>
                <div className="h-full rounded-full bg-moss" style={{ width: `${progressPercent(candidate)}%` }} />
              </div>
            </div>
          </div>
        </label>
      ))}

      <div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          選んだ日程で確定する
        </button>
      </div>
    </form>
  );
}
