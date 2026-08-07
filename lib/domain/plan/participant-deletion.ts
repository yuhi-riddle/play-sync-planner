/** 削除しようとした参加者に紐づいているお金。立替の名前だけ持つ。 */
export type ParticipantMoneyLinks = {
  /** その人が立て替えた立替。 */
  paidExpenseTitles: string[];
  /** その人が負担者に入っている立替。 */
  splitExpenseTitles: string[];
};

/** 画面に並べる立替名の上限。多いときは「ほか N件」にまとめる。 */
const MAX_LISTED_TITLES = 3;

function joinTitles(titles: string[]) {
  const listed = titles.slice(0, MAX_LISTED_TITLES).map((title) => `「${title}」`).join("、");
  const rest = titles.length - MAX_LISTED_TITLES;
  return rest > 0 ? `${listed} ほか${rest}件` : listed;
}

/**
 * 参加者を削除してよいか。消せないなら理由を返す。
 *
 * お金が絡んでいる参加者は消さない。expense_splits は削除連鎖するので、
 * 消すと「立替の金額」と「負担額の合計」が黙ってズレる
 * （両者が一致することを保証する制約はDBに無い）。
 * settlements も実テーブルなので、支払い履歴ごと消える。
 *
 * 先に立替側を直してもらう。名前ゆれで増えた参加者やドタキャンは、
 * たいていお金が動く前なので、これで実用上は足りる。
 */
export function participantDeletionRefusal(displayName: string, links: ParticipantMoneyLinks): string | null {
  if (links.paidExpenseTitles.length > 0) {
    return `${displayName}さんが立て替えた記録があります（${joinTitles(links.paidExpenseTitles)}）。先に立替を削除するか、立て替えた人を変更してください。`;
  }

  if (links.splitExpenseTitles.length > 0) {
    return `${displayName}さんが負担者に入っている立替があります（${joinTitles(links.splitExpenseTitles)}）。先に立替の負担者から外してください。`;
  }

  return null;
}
