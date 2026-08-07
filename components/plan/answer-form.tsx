"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadPreviousAnswersAction, submitAvailabilityAnswersAction } from "@/lib/actions/plan/answers";
import {
  buildCandidateCalendarHints,
  monthsForCandidates,
  type AnswerCalendarEvent,
  type AnswerCandidateDate
} from "@/lib/domain/plan/answer-calendar";
import { canApplyPreviousAnswers, type PreviousAnswer } from "@/lib/domain/plan/previous-answers";
import { formatDateTimeRange } from "@/lib/shared/format";
import { MadoiForm, Skeleton, TextField } from "@/components/ui";

/** CalendarNotice が空文字になっても縮まないようにする最低高。 */
export const CALENDAR_NOTICE_MIN_HEIGHT_CLASS = "min-h-4";

/** CandidateCalendarWarningの読み込み中Skeletonに使う最低高。 */
export const CANDIDATE_WARNING_MIN_HEIGHT_CLASS = "min-h-9";

type AnswerChoice = "yes" | "maybe" | "no";

type PreviousAnswers = {
  participantName: string;
  answers: Record<string, PreviousAnswer>;
};

type GoogleCalendarResponse = {
  connected: boolean;
  busy: AnswerCalendarEvent[];
};

const choices: Array<{ value: AnswerChoice; label: string; shortLabel: string; ariaText: string }> = [
  { value: "yes", label: "○ 行ける", shortLabel: "○", ariaText: "行ける" },
  { value: "maybe", label: "△ 調整できるかも", shortLabel: "△", ariaText: "調整できるかも" },
  { value: "no", label: "× 行けない", shortLabel: "×", ariaText: "行けない" }
];

function uniqueCalendarEvents(events: AnswerCalendarEvent[]) {
  const seen = new Set<string>();

  return events.filter((event) => {
    const key = `${event.start}-${event.end}-${event.title ?? ""}-${event.location ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function CalendarNotice({
  state
}: {
  state: "idle" | "loading" | "ready" | "disconnected" | "error";
}) {
  return (
    <p
      data-testid="calendar-notice"
      className={`mt-3 text-xs ${CALENDAR_NOTICE_MIN_HEIGHT_CLASS} ${state === "error" ? "text-clay-ink" : "text-muted"}`}
    >
      {state === "loading" ? "Google Calendarを確認中です。" : null}
      {state === "disconnected" ? "Google Calendar未連携のため、候補日の重なり確認は表示していません。" : null}
      {state === "error" ? "Google Calendarを取得できませんでした。回答はこのまま送信できます。" : null}
    </p>
  );
}

function CandidateCalendarWarning({ events, loading }: { events: AnswerCalendarEvent[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3">
        <Skeleton className={`${CANDIDATE_WARNING_MIN_HEIGHT_CLASS} w-full`} />
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-control border border-clay/24 bg-clay/8 p-3">
      <p className="text-sm font-bold text-ink">Google予定と重なっています</p>
      <ul className="mt-2 grid gap-2">
        {events.map((event) => (
          <li key={`${event.start}-${event.end}-${event.title ?? ""}`} className="rounded-control bg-surface px-3 py-2 text-sm text-ink">
            <p className="font-bold">{event.title || "予定あり"}</p>
            <p className="mt-1 text-xs text-muted">{formatDateTimeRange(event.start, event.end)}</p>
            {event.location ? <p className="mt-1 text-xs text-muted">{event.location}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnswerForm({ token, candidateDates }: { token: string; candidateDates: AnswerCandidateDate[] }) {
  const action = submitAvailabilityAnswersAction.bind(null, token);
  const [answers, setAnswers] = useState<Record<string, AnswerChoice | undefined>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [calendarEvents, setCalendarEvents] = useState<AnswerCalendarEvent[]>([]);
  const [calendarState, setCalendarState] = useState<"idle" | "loading" | "ready" | "disconnected" | "error">("idle");
  const [previousOffer, setPreviousOffer] = useState<PreviousAnswers | null>(null);
  const [appliedName, setAppliedName] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  // 同じ名前で何度も引かない。名前欄は候補を選ぶたびに出入りする
  const lookedUpName = useRef("");
  const answeredCount = useMemo(
    () => candidateDates.filter((candidate) => answers[candidate.id]).length,
    [answers, candidateDates]
  );
  const commentCount = useMemo(() => Object.values(comments).filter((comment) => comment.trim()).length, [comments]);
  const allAnswered = candidateDates.length > 0 && answeredCount === candidateDates.length;
  const remainingCount = candidateDates.length - answeredCount;
  const progressPercent = candidateDates.length === 0 ? 0 : Math.round((answeredCount / candidateDates.length) * 100);
  const candidateHints = useMemo(
    () => buildCandidateCalendarHints({ candidates: candidateDates, busyRanges: calendarEvents }),
    [calendarEvents, candidateDates]
  );

  useEffect(() => {
    const months = monthsForCandidates(candidateDates);
    if (months.length === 0) {
      setCalendarState("idle");
      setCalendarEvents([]);
      return;
    }

    let cancelled = false;
    setCalendarState("loading");

    Promise.all(
      months.map((month) =>
        Promise.resolve(fetch(`/api/google-calendar/freebusy?month=${month}`)).then(async (response) => {
          if (!response?.ok) {
            throw new Error("failed");
          }

          return (await response.json()) as GoogleCalendarResponse;
        })
      )
    )
      .then((responses) => {
        if (cancelled) {
          return;
        }

        if (responses.some((response) => !response.connected)) {
          setCalendarEvents([]);
          setCalendarState("disconnected");
          return;
        }

        setCalendarEvents(uniqueCalendarEvents(responses.flatMap((response) => response.busy)));
        setCalendarState("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setCalendarEvents([]);
        setCalendarState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [candidateDates]);

  function setAnswer(candidateId: string, answer: AnswerChoice) {
    setAnswers((current) => ({ ...current, [candidateId]: answer }));
  }

  function applyAll(answer: AnswerChoice) {
    setAnswers(Object.fromEntries(candidateDates.map((candidate) => [candidate.id, answer])));
  }

  /*
   * 前回の回答を当てる。丸ごと入れ替えずに重ねるのは、前回のあとで
   * 候補が増えていることがあるため。増えた分は空のまま残す。
   */
  function applyPrevious(previous: PreviousAnswers) {
    const entries = Object.entries(previous.answers);
    setAnswers((current) => ({
      ...current,
      ...Object.fromEntries(entries.map(([candidateId, saved]) => [candidateId, saved.answer]))
    }));
    setComments((current) => ({
      ...current,
      ...Object.fromEntries(entries.map(([candidateId, saved]) => [candidateId, saved.comment]))
    }));
    setAppliedName(previous.participantName);
    setPreviousOffer(null);
  }

  function handleNameBlur(value: string) {
    const name = value.trim();
    if (!name || name === lookedUpName.current) {
      return;
    }

    lookedUpName.current = name;
    setPreviousOffer(null);
    setAppliedName(null);

    startLookup(async () => {
      const result = await loadPreviousAnswersAction(token, name);
      if (!result.found) {
        return;
      }

      const previous = { participantName: result.participantName, answers: result.answers };
      // 手で選んだ回答を黙って消さない。何か入っていたら押してもらう
      if (canApplyPreviousAnswers({ answeredCount, commentCount })) {
        applyPrevious(previous);
        return;
      }

      setPreviousOffer(previous);
    });
  }

  return (
    <MadoiForm action={action} className="grid gap-5">
      <div className="grid gap-3">
        <TextField
          label="名前"
          name="displayName"
          required
          requiredMessage="回答する人の名前を入力してください"
          // 前に回答した人なら、名前を入れた時点で前回の内容を戻す
          onBlurValue={handleNameBlur}
        />
        <div aria-live="polite">
          {isLookingUp ? <p className="text-caption text-muted">前回の回答を確認しています。</p> : null}
          {appliedName ? (
            <p className="text-caption text-pine">
              {appliedName}さんの前回の回答を読み込みました。変えたいところだけ直してください。
            </p>
          ) : null}
          {previousOffer ? (
            <div className="rounded-control border border-line-strong bg-sunken p-3">
              <p className="text-body font-bold text-ink">{previousOffer.participantName}さんの前回の回答があります。</p>
              <p className="mt-1 text-caption leading-5 text-muted">読み込むと、いま選んでいる内容は上書きされます。</p>
              <button
                type="button"
                onClick={() => applyPrevious(previousOffer)}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                前回の回答を読み込む
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="rounded-control border border-line bg-surface p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">
              回答済み {answeredCount}/{candidateDates.length}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">候補が多いときは一括入力して、違う日だけ直せます。</p>
            <CalendarNotice state={calendarState} />
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                onClick={() => applyAll(choice.value)}
              >
                全部{choice.shortLabel}
              </button>
            ))}
          </div>
        </div>
        <div
          className="mt-4 h-2 rounded-full bg-surface"
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
        {candidateDates.map((candidate, index) => {
          const conflictingEvents = candidateHints[candidate.id]?.events ?? [];

          const isUnanswered = !answers[candidate.id];

          return (
            <fieldset
              key={candidate.id}
              className={`rounded-control border bg-surface p-4 ${isUnanswered ? "border-clay/60" : "border-line"}`}
            >
              <legend className="px-1 text-sm font-semibold text-ink">
                候補{index + 1} {formatDateTimeRange(candidate.start_at, candidate.end_at, Boolean(candidate.is_all_day))}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {choices.map((choice) => (
                  <label
                    key={choice.value}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-semibold"
                  >
                    <input
                      type="radio"
                      name={`answer:${candidate.id}`}
                      value={choice.value}
                      required
                      data-field-label={`候補 ${index + 1}`}
                      data-required-message={`候補 ${index + 1} の回答を選択してください`}
                      checked={answers[candidate.id] === choice.value}
                      onChange={() => setAnswer(candidate.id, choice.value)}
                      aria-label={`候補${index + 1}に${choice.ariaText}と回答`}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
              <CandidateCalendarWarning events={conflictingEvents} loading={calendarState === "loading"} />
              <label className="mt-3 block text-sm font-medium text-ink">
                <span>コメント</span>
                {/* 前回のコメントを戻せるように制御する。非制御だと、回答だけ戻ってコメントが空のまま送られる */}
                <input
                  className="mt-2 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                  name={`comment:${candidate.id}`}
                  value={comments[candidate.id] ?? ""}
                  onChange={(event) =>
                    setComments((current) => ({ ...current, [candidate.id]: event.target.value }))
                  }
                />
              </label>
            </fieldset>
          );
        })}
      </div>
      <div>
        <p aria-live="polite" className="mb-2 text-sm text-clay-ink">
          {remainingCount > 0 ? `残り${remainingCount}件の候補に回答すると送信できます。` : ""}
        </p>
        <button
          type="submit"
          disabled={!allAnswered}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-ink/35 disabled:text-white/78 disabled:shadow-none"
        >
          回答する
        </button>
      </div>
    </MadoiForm>
  );
}
