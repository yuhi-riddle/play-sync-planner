"use client";

import React, { useEffect, useMemo, useState } from "react";

import { submitAvailabilityAnswersAction } from "@/lib/actions/answers";
import {
  buildCandidateCalendarHints,
  monthsForCandidates,
  type AnswerCalendarEvent,
  type AnswerCandidateDate
} from "@/lib/domain/answer-calendar";
import { formatDateTimeRange } from "@/lib/format";
import { TextField } from "@/components/ui";

type AnswerChoice = "yes" | "maybe" | "no";

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
  if (state === "loading") {
    return <p className="mt-3 text-xs text-ink/55">Google Calendarを確認中です。</p>;
  }

  if (state === "disconnected") {
    return <p className="mt-3 text-xs text-ink/55">Google Calendar未連携のため、候補日の重なり確認は表示していません。</p>;
  }

  if (state === "error") {
    return <p className="mt-3 text-xs text-clay">Google Calendarを取得できませんでした。回答はこのまま送信できます。</p>;
  }

  return null;
}

function CandidateCalendarWarning({ events }: { events: AnswerCalendarEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-clay/24 bg-clay/8 p-3">
      <p className="text-sm font-bold text-ink">Google予定と重なっています</p>
      <ul className="mt-2 grid gap-2">
        {events.map((event) => (
          <li key={`${event.start}-${event.end}-${event.title ?? ""}`} className="rounded-lg bg-white/62 px-3 py-2 text-sm text-ink">
            <p className="font-bold">{event.title || "予定あり"}</p>
            <p className="mt-1 text-xs text-ink/60">{formatDateTimeRange(event.start, event.end)}</p>
            {event.location ? <p className="mt-1 text-xs text-ink/60">{event.location}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnswerForm({ token, candidateDates }: { token: string; candidateDates: AnswerCandidateDate[] }) {
  const action = submitAvailabilityAnswersAction.bind(null, token);
  const [answers, setAnswers] = useState<Record<string, AnswerChoice | undefined>>({});
  const [calendarEvents, setCalendarEvents] = useState<AnswerCalendarEvent[]>([]);
  const [calendarState, setCalendarState] = useState<"idle" | "loading" | "ready" | "disconnected" | "error">("idle");
  const answeredCount = useMemo(
    () => candidateDates.filter((candidate) => answers[candidate.id]).length,
    [answers, candidateDates]
  );
  const allAnswered = candidateDates.length > 0 && answeredCount === candidateDates.length;
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

  return (
    <form action={action} className="grid gap-5">
      <TextField label="名前" name="displayName" required requiredMessage="回答する人の名前を入力してください" />
      <div className="rounded-lg border border-white/80 bg-cream/86 p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">
              回答済み {answeredCount}/{candidateDates.length}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink/60">候補が多いときは一括入力して、違う日だけ直せます。</p>
            <CalendarNotice state={calendarState} />
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-full border border-ink/10 bg-white/84 px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                onClick={() => applyAll(choice.value)}
              >
                全部{choice.shortLabel}
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
        {candidateDates.map((candidate, index) => {
          const conflictingEvents = candidateHints[candidate.id]?.events ?? [];

          return (
            <fieldset key={candidate.id} className="rounded-lg border border-white/80 bg-white/68 p-4">
              <legend className="px-1 text-sm font-semibold text-ink">
                候補{index + 1} {formatDateTimeRange(candidate.start_at, candidate.end_at)}
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {choices.map((choice) => (
                  <label
                    key={choice.value}
                    className="flex items-center gap-2 rounded-full border border-ink/10 bg-cream/80 px-3 py-2 text-sm font-semibold"
                  >
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
              <CandidateCalendarWarning events={conflictingEvents} />
              <label className="mt-3 block text-sm font-medium text-ink">
                <span>コメント</span>
                <input
                  className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                  name={`comment:${candidate.id}`}
                />
              </label>
            </fieldset>
          );
        })}
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
