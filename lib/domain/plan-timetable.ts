export type TimetableAssignee = {
  participantId: string;
  displayName: string;
  /** participants.status。declined / cancelled は取り消し線で出し続ける。 */
  status: string;
};

export type TimetableItem = {
  id: string;
  startAt: string;
  endAt: string | null;
  title: string;
  note: string | null;
  createdAt: string;
  assignees: TimetableAssignee[];
};

export type TimetableDateGroup = {
  dateKey: string;
  items: TimetableItem[];
};

// 日付の境界は JST 固定。テスト環境や Vercel の TZ に左右させない。
const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function toJstDateKey(value: string): string {
  return jstDateFormatter.format(new Date(value));
}

function timeOf(value: string): number {
  return new Date(value).getTime();
}

/** 開始時刻の昇順。同時刻は作成順で決着する。 */
export function sortTimetableItems(items: TimetableItem[]): TimetableItem[] {
  return [...items].sort(
    (a, b) => timeOf(a.startAt) - timeOf(b.startAt) || timeOf(a.createdAt) - timeOf(b.createdAt)
  );
}

/** 日をまたぐ項目は開始日のグループに入れる。見出しを出すかどうかは呼び出し側が決める。 */
export function groupTimetableItemsByDate(items: TimetableItem[]): TimetableDateGroup[] {
  const groups: TimetableDateGroup[] = [];

  for (const item of sortTimetableItems(items)) {
    const dateKey = toJstDateKey(item.startAt);
    const last = groups[groups.length - 1];

    if (last && last.dateKey === dateKey) {
      last.items.push(item);
      continue;
    }

    groups.push({ dateKey, items: [item] });
  }

  return groups;
}
