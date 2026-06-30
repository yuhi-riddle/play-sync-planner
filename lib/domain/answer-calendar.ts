import { rangesOverlap, type BusyRange } from "@/lib/domain/calendar-availability";

export type AnswerCandidateDate = {
  id: string;
  start_at: string;
  end_at: string | null;
};

export type AnswerCalendarEvent = BusyRange & {
  title: string | null;
  location: string | null;
};

export type CandidateCalendarHint = {
  hasConflict: boolean;
  events: AnswerCalendarEvent[];
};

export function monthsForCandidates(candidates: AnswerCandidateDate[]): string[] {
  return Array.from(new Set(candidates.map((candidate) => candidate.start_at.slice(0, 7)))).sort();
}

function candidateRange(candidate: AnswerCandidateDate): BusyRange {
  return {
    start: candidate.start_at,
    end: candidate.end_at ?? candidate.start_at
  };
}

export function buildCandidateCalendarHints({
  candidates,
  busyRanges
}: {
  candidates: AnswerCandidateDate[];
  busyRanges: AnswerCalendarEvent[];
}): Record<string, CandidateCalendarHint> {
  return Object.fromEntries(
    candidates.map((candidate) => {
      const range = candidateRange(candidate);
      const events = busyRanges.filter((busyRange) => rangesOverlap(range, busyRange));

      return [
        candidate.id,
        {
          hasConflict: events.length > 0,
          events
        }
      ];
    })
  );
}
