"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { confirmPlanAction } from "@/lib/actions/plan/confirm";
import type { CandidateAnswerSummary } from "@/lib/domain/plan/confirmation";
import { formatDateTimeRange } from "@/lib/shared/format";
import { MadoiForm, SubmitButton } from "@/components/ui";

function AnswerStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-center text-sm font-bold" aria-label={`${label} ${value}`}>
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
  const rankedCandidates = useMemo(() => [...candidates].sort((a, b) => a.rank - b.rank), [candidates]);
  const initialCandidateId = rankedCandidates.find((candidate) => candidate.recommended)?.id ?? rankedCandidates[0]?.id ?? "";
  const [selectedCandidateId, setSelectedCandidateId] = useState(initialCandidateId);
  const [pendingCandidate, setPendingCandidate] = useState<CandidateAnswerSummary | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const selectedCandidate = rankedCandidates.find((candidate) => candidate.id === selectedCandidateId);

  useEffect(() => {
    if (pendingCandidate) {
      confirmButtonRef.current?.focus();
    }
  }, [pendingCandidate]);

  function openConfirmation() {
    if (selectedCandidate) {
      setPendingCandidate(selectedCandidate);
    }
  }

  return (
    <MadoiForm action={action} className="grid gap-4">
      <div className="rounded-control border border-moss/20 bg-mist/24 p-4">
        <p className="text-sm font-bold text-ink">候補を選んで確定します。</p>
        <p className="mt-1 text-sm leading-6 text-muted">
          おすすめ順に並べています。未回答が残っている候補は、確定前に確認してください。
        </p>
      </div>

      {rankedCandidates.map((candidate) => (
        <label
          key={candidate.id}
          aria-label={`${candidate.rank}位の候補 ${candidate.id}`}
          className="block rounded-control border border-line bg-surface p-4 transition-colors hover:border-moss/45"
        >
          <div className="flex items-start gap-3">
            <input
              className="mt-1"
              type="radio"
              name="candidateDateId"
              value={candidate.id}
              required
              data-field-label="確定する日程"
              data-required-message="確定する日程を選択してください"
              checked={selectedCandidateId === candidate.id}
              onChange={() => setSelectedCandidateId(candidate.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">{candidate.rank}位</span>
                {candidate.recommended ? <span className="rounded-full bg-honey/32 px-3 py-1 text-xs font-bold text-ink">おすすめ</span> : null}
                {candidate.hasPendingAnswers ? <span className="rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay-ink">未回答あり</span> : null}
                <span className="rounded-full bg-mist/42 px-3 py-1 text-xs font-bold text-pine">スコア {candidate.score}</span>
              </div>

              <p className="mt-3 text-base font-bold text-ink">{formatDateTimeRange(candidate.start_at, candidate.end_at, Boolean(candidate.is_all_day))}</p>
              <p className="mt-1 text-sm text-muted">
                回答済み {candidate.answered}/{candidate.totalParticipants}人
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <AnswerStat label="○" value={candidate.yes} tone="text-pine" />
                <AnswerStat label="△" value={candidate.maybe} tone="text-moss" />
                <AnswerStat label="×" value={candidate.no} tone="text-clay-ink" />
                <AnswerStat label="未" value={candidate.unanswered} tone="text-muted" />
              </div>

              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-ink/8"
                aria-label={`回答率 ${progressPercent(candidate)}%`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={candidate.totalParticipants}
                aria-valuenow={candidate.answered}
              >
                <div className="h-full rounded-full bg-moss" style={{ width: `${progressPercent(candidate)}%` }} />
              </div>
            </div>
          </div>
        </label>
      ))}

      <div>
        <button
          type="button"
          onClick={openConfirmation}
          disabled={!selectedCandidate}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          選んだ日程で確定する
        </button>
      </div>

      {pendingCandidate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/42 px-4 py-8 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-lg rounded-control border border-line bg-cream p-5 shadow-soft"
          >
            <p className="text-eyebrow uppercase text-pine">Madoi</p>
            <h2 id="confirm-dialog-title" className="mt-2 text-2xl font-bold text-ink">
              日程を確定しますか？
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              確定すると、回答状況に応じて参加者の状態を更新します。必要なら確定後に清算へ進めます。
            </p>
            <div className="mt-4 rounded-control border border-moss/18 bg-mist/24 p-4">
              <p className="text-eyebrow uppercase text-pine">確定する日程</p>
              <p className="mt-2 text-base font-bold text-ink">
                {formatDateTimeRange(pendingCandidate.start_at, pendingCandidate.end_at, Boolean(pendingCandidate.is_all_day))}
              </p>
              <p className="mt-1 text-sm text-muted">
                ○ {pendingCandidate.yes} / △ {pendingCandidate.maybe} / × {pendingCandidate.no} / 未回答 {pendingCandidate.unanswered}
              </p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingCandidate(null)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-5 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                戻る
              </button>
              <SubmitButton ref={confirmButtonRef} className="text-sm" pendingChildren="確定中…">
                この日程で確定
              </SubmitButton>
            </div>
          </section>
        </div>
      ) : null}
    </MadoiForm>
  );
}
