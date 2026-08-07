import type { AvailabilityAnswer } from "@/lib/domain/plan/availability";

/** 画面に戻せる回答。「未回答」は戻す意味がないので含めない。 */
export type PreviousAnswerChoice = "yes" | "maybe" | "no";

export type PreviousAnswer = {
  answer: PreviousAnswerChoice;
  comment: string;
};

export type PreviousAnswerRow = {
  candidate_date_id: string;
  answer: AvailabilityAnswer | string | null;
  comment: string | null;
};

function isChoice(value: unknown): value is PreviousAnswerChoice {
  return value === "yes" || value === "maybe" || value === "no";
}

/**
 * 保存済みの回答を、候補日IDをキーにした形に直す。
 *
 * unanswered は落とす。戻してしまうと「前回は未回答だった」が
 * ラジオのどれにも当てはまらず、送信ボタンが押せない状態を復元することになる。
 */
export function buildPreviousAnswerMap(rows: PreviousAnswerRow[]): Record<string, PreviousAnswer> {
  const map: Record<string, PreviousAnswer> = {};

  for (const row of rows) {
    if (!row.candidate_date_id || !isChoice(row.answer)) {
      continue;
    }

    map[row.candidate_date_id] = {
      answer: row.answer,
      comment: row.comment ?? ""
    };
  }

  return map;
}
