import type { HomeCalendarItem, HomeCalendarItemKind } from "@/lib/domain/home/home-calendar";

/**
 * JST の当日 0 時（絶対時刻）。now は絶対時刻なので JST に直してから日付境界を取る。
 * 「次の予定」の下限は常にこの値で揃える。取得クエリの下限に現在時刻を使うと、
 * 当日 00:00 開始の終日予定などが pickNextUpcoming に届く前に落ちてしまう。
 */
export function jstStartOfToday(now: Date): Date {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000);
}

function sortByStart(items: HomeCalendarItem[]): HomeCalendarItem[] {
  return [...items].sort((left, right) => {
    const diff = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
    return diff !== 0 ? diff : left.id.localeCompare(right.id);
  });
}

/**
 * ホームの「次の予定」に出す1件を選ぶ。
 * 確定を最優先し、無ければ調整中の最も近いもの。google は対象外。
 */
export function pickNextUpcoming(items: HomeCalendarItem[], now: Date): HomeCalendarItem | null {
  const floor = jstStartOfToday(now).getTime();
  const upcoming = items.filter((item) => new Date(item.startAt).getTime() >= floor);

  const byKind = (kind: HomeCalendarItemKind) => sortByStart(upcoming.filter((item) => item.kind === kind));

  return byKind("confirmed")[0] ?? byKind("collecting")[0] ?? null;
}
