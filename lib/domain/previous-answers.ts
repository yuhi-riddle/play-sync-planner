import type { AvailabilityAnswer } from "@/lib/domain/availability";

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

/**
 * 前回の回答を、入力中のものを消さずに当てても良いか。
 *
 * 名前を打ち終えるより先に候補を選ぶ人がいる。そこに黙って上書きすると、
 * 手で選んだ回答が消える。何か入っていたら、押してもらう形にする。
 */
export function canApplyPreviousAnswers({
  answeredCount,
  commentCount
}: {
  answeredCount: number;
  commentCount: number;
}) {
  return answeredCount === 0 && commentCount === 0;
}
