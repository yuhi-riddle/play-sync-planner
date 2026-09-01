import type { HomeCalendarItem, HomeCalendarItemKind } from "@/lib/domain/home/home-calendar";

/** JST の当日 0 時。now は絶対時刻なので JST に直してから日付境界を取る。 */
function jstStartOfToday(now: Date): number {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000;
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
  const floor = jstStartOfToday(now);
  const upcoming = items.filter((item) => new Date(item.startAt).getTime() >= floor);

  const byKind = (kind: HomeCalendarItemKind) => sortByStart(upcoming.filter((item) => item.kind === kind));

  return byKind("confirmed")[0] ?? byKind("collecting")[0] ?? null;
}
