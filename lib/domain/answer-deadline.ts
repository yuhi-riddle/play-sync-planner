/** 回答期限を延ばす日数の選択肢。画面のボタンとサーバー側の検証で同じ配列を使う。 */
export const ANSWER_DEADLINE_EXTENSION_DAYS = [1, 3, 7] as const;

export type AnswerDeadlineExtensionDays = (typeof ANSWER_DEADLINE_EXTENSION_DAYS)[number];

export function parseAnswerDeadlineExtensionDays(value: unknown): AnswerDeadlineExtensionDays | null {
  const days = Number(value);
  return ANSWER_DEADLINE_EXTENSION_DAYS.includes(days as AnswerDeadlineExtensionDays)
    ? (days as AnswerDeadlineExtensionDays)
    : null;
}

/**
 * 延ばしたあとの回答期限。
 *
 * 起点は「今」と「いまの期限」の遅いほう。
 * - 期限をとっくに過ぎている場合、元の期限に足すと延ばしても過去のままになる。
 * - まだ期限前の場合、今から数えると逆に期限が縮む。
 *
 * 日数は 24 時間の倍数で足す。JST の「その日の終わり」に寄せると、
 * サーバーが UTC で動く本番（Vercel）と手元で結果が変わる。
 */
export function extendedAnswerDeadline(
  currentDeadlineAt: string | null,
  days: AnswerDeadlineExtensionDays,
  now: Date
): string {
  const current = currentDeadlineAt ? new Date(currentDeadlineAt).getTime() : Number.NaN;
  const base = Number.isNaN(current) ? now.getTime() : Math.max(current, now.getTime());
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}
