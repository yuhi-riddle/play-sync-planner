import { toJstDateKey } from "@/lib/shared/jst";

export type AdjustmentCandidate = {
  id: string;
  planId: string;
  eventTitle: string;
  planTitle: string | null;
  startAt: string;
  endAt?: string | null;
  isAllDay?: boolean | null;
  status: string;
  yes: number;
  maybe: number;
  no: number;
  unanswered: number;
};

export type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  candidateCount: number;
  hasOverlap: boolean;
  hasConfirmed: boolean;
  hasCollecting: boolean;
};

export type AdjustmentCalendar = {
  weeks: CalendarDay[][];
  daysByKey: Map<string, CalendarDay>;
  selectedDateKey: string;
  selectedCandidates: AdjustmentCandidate[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * カレンダーの升目そのものの日付キー。
 *
 * ここに渡す Date は new Date(year, monthIndex, day) で組み立てたローカルの 0 時（升目の座標）で、
 * 絶対時刻ではない。組み立てと読み出しが同じローカル TZ なので往復しても値は変わらず、
 * 実行環境の TZ に左右されない。
 *
 * 候補日時のような「絶対時刻がどの日に属するか」には使わないこと。そちらは JST で
 * 判断する必要があるので toJstDateKey を使う（candidateDateKeys を参照）。
 */
export function toDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 表示中の月に「今日」が含まれていればその日、含まれていなければ月初を選ぶ。
 *
 * 「今日」は JST で決める。app/plans/page.tsx はサーバーコンポーネントなので、
 * ローカルゲッターで出すと Vercel(UTC) では JST 00:00〜09:00 のあいだ前日になり、
 * カレンダーが「昨日」を選択した状態で開いてしまう。
 *
 * page.tsx は任意の名前付き export を持てず単体テストから触れないので、ここに置く。
 */
export function defaultSelectedDateKey(year: number, month: number, now: Date): string {
  const monthKey = `${year}-${pad2(month)}`;
  const todayKey = toJstDateKey(now);

  return todayKey.startsWith(`${monthKey}-`) ? todayKey : `${monthKey}-01`;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getCandidateEnd(candidate: AdjustmentCandidate) {
  const end = candidate.endAt ? new Date(candidate.endAt) : new Date(candidate.startAt);
  if (!candidate.isAllDay) {
    return end;
  }

  // 終日候補の end は排他的なので1日戻す。ローカルの setDate ではなく
  // タイムスタンプで引くことで、実行環境の TZ（と夏時間）に結果を左右させない。
  return new Date(end.getTime() - DAY_IN_MS);
}

/**
 * 候補が載る日付キー。開始・終了は絶対時刻なので、どの日に属するかは JST で決める。
 *
 * ローカルゲッター（getDate 等）で日付を出すと、Vercel(UTC) では
 * 「JST 7/13 01:30 終了」が 7/12 扱いになり、日をまたぐ候補が翌日のマスに出ない。
 * 開発機は JST なのでローカルでは再現しない。
 */
function candidateDateKeys(candidate: AdjustmentCandidate) {
  const keys: string[] = [];
  const startKey = toJstDateKey(candidate.startAt);
  const endKey = toJstDateKey(getCandidateEnd(candidate));
  // 日付キーどうしの間を1日ずつ埋める。境界の判断は toJstDateKey が済ませているので、
  // 起点を JST の 0 時に揃えておけば 24 時間刻みで足りる（JST に夏時間が無いため）。
  const cursor = new Date(`${startKey}T00:00:00+09:00`);
  const last = new Date(`${endKey}T00:00:00+09:00`);

  while (cursor.getTime() <= last.getTime()) {
    keys.push(toJstDateKey(cursor));
    cursor.setTime(cursor.getTime() + DAY_IN_MS);
  }

  return keys;
}

function groupCandidatesByDate(candidates: AdjustmentCandidate[]) {
  const grouped = new Map<string, AdjustmentCandidate[]>();

  for (const candidate of candidates) {
    for (const key of candidateDateKeys(candidate)) {
      grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
    }
  }

  for (const [key, items] of grouped) {
    grouped.set(
      key,
      [...items].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime())
    );
  }

  return grouped;
}

function hasOverlappingTimeRanges(candidates: AdjustmentCandidate[]) {
  const sorted = [...candidates].sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousStart = new Date(previous.startAt).getTime();
    const currentStart = new Date(current.startAt).getTime();
    if (currentStart === previousStart || currentStart < getCandidateEnd(previous).getTime()) {
      return true;
    }
  }

  return false;
}

export function buildAdjustmentCalendar({
  year,
  month,
  selectedDateKey,
  candidates
}: {
  year: number;
  month: number;
  selectedDateKey: string;
  candidates: AdjustmentCandidate[];
}): AdjustmentCalendar {
  const grouped = groupCandidatesByDate(candidates);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay());
  const daysByKey = new Map<string, CalendarDay>();
  const weeks: CalendarDay[][] = [];

  for (let cursor = new Date(gridStart), index = 0; cursor <= gridEnd; cursor = addDays(cursor, 1), index += 1) {
    const dateKey = toDateKey(cursor);
    const dayCandidates = grouped.get(dateKey) ?? [];
    const day: CalendarDay = {
      date: new Date(cursor),
      dateKey,
      day: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === month - 1,
      isSelected: dateKey === selectedDateKey,
      candidateCount: dayCandidates.length,
      hasOverlap: hasOverlappingTimeRanges(dayCandidates),
      hasConfirmed: dayCandidates.some((candidate) => candidate.status === "date_confirmed"),
      hasCollecting: dayCandidates.some((candidate) => candidate.status === "collecting_answers" || candidate.status === "draft")
    };

    daysByKey.set(dateKey, day);
    const weekIndex = Math.floor(index / 7);
    weeks[weekIndex] = [...(weeks[weekIndex] ?? []), day];
  }

  return {
    weeks,
    daysByKey,
    selectedDateKey,
    selectedCandidates: grouped.get(selectedDateKey) ?? []
  };
}
