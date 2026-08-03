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

export type TimetableLane = {
  key: string;
  assignees: TimetableAssignee[];
  items: TimetableItem[];
};

export type TimetableBlock =
  | { kind: "single"; item: TimetableItem }
  | { kind: "branch"; startAt: string; endAt: string; lanes: TimetableLane[] };

/** 担当の集合でレーンを決める。担当が空の行は行ごとに単独レーンにする。 */
function laneKeyOf(item: TimetableItem): string {
  if (item.assignees.length === 0) {
    return `item:${item.id}`;
  }

  return item.assignees
    .map((assignee) => assignee.participantId)
    .slice()
    .sort()
    .join(",");
}

function buildLanes(members: TimetableItem[]): TimetableLane[] {
  const lanes: TimetableLane[] = [];
  const laneByKey = new Map<string, TimetableLane>();

  for (const item of members) {
    const key = laneKeyOf(item);
    const existing = laneByKey.get(key);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    const lane: TimetableLane = { key, assignees: item.assignees, items: [item] };
    laneByKey.set(key, lane);
    lanes.push(lane);
  }

  return lanes;
}

/**
 * end_at を持つ行同士の時間帯の重なりだけを分岐とみなす。
 * end_at の無い行（「13:00 集合」「13:00 受付開始」）を分岐と誤判定しないため。
 * 重なりは推移的につながる（A と B、B と C が重なれば A・B・C で1ブロック）。
 */
export function buildTimetableBlocks(items: TimetableItem[]): TimetableBlock[] {
  const sorted = sortTimetableItems(items);
  const timed = sorted.filter((item): item is TimetableItem & { endAt: string } => item.endAt !== null);

  const clusterIdByItemId = new Map<string, number>();
  // endAt を string に固定した型にすることで、上の endAt !== null フィルタを外すとコンパイルエラーになる。
  // 「end_at の無い行は分岐に参加しない」という不変条件を型でも縛るため。
  const membersByClusterId = new Map<number, Array<TimetableItem & { endAt: string }>>();
  let clusterId = 0;
  let clusterEnd = Number.NEGATIVE_INFINITY;

  for (const item of timed) {
    const start = timeOf(item.startAt);
    const end = timeOf(item.endAt);

    // 終わりと始まりが接するだけ（start === clusterEnd）は重なりにしない。
    if (start >= clusterEnd) {
      clusterId += 1;
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }

    clusterIdByItemId.set(item.id, clusterId);
    const members = membersByClusterId.get(clusterId) ?? [];
    members.push(item);
    membersByClusterId.set(clusterId, members);
  }

  const blocks: TimetableBlock[] = [];
  const emitted = new Set<number>();

  for (const item of sorted) {
    const id = clusterIdByItemId.get(item.id);
    const members = id === undefined ? undefined : membersByClusterId.get(id);

    if (id === undefined || !members || members.length === 1) {
      blocks.push({ kind: "single", item });
      continue;
    }

    if (emitted.has(id)) {
      continue;
    }

    emitted.add(id);
    blocks.push({
      kind: "branch",
      startAt: members[0].startAt,
      endAt: new Date(Math.max(...members.map((member) => timeOf(member.endAt)))).toISOString(),
      lanes: buildLanes(members)
    });
  }

  return blocks;
}

/**
 * 自分より後に「別の時刻で」始まる最初の行の開始時刻。
 * 同時刻の行（二手に分かれた行同士）は、互いの終了時刻と誤認しないよう飛ばす
 * （例: 海チームとカフェ組が同時刻に始まっても、片方をもう片方の終わりにしてはいけない）。
 * 日をまたいだ行は対象にしない。翌日まで対象にすると、前日最後の行の所要時間や
 * 「いまここ」判定が翌朝まで続いてしまう（例: 17:00「解散」の次が翌朝10:00「集合」）。
 */
function nextStartAfter(sorted: TimetableItem[], index: number, start: number): number | null {
  const dateKey = toJstDateKey(sorted[index].startAt);

  for (let cursor = index + 1; cursor < sorted.length; cursor += 1) {
    if (toJstDateKey(sorted[cursor].startAt) !== dateKey) {
      return null;
    }

    const candidate = timeOf(sorted[cursor].startAt);

    if (candidate > start) {
      return candidate;
    }
  }

  return null;
}

/**
 * 行の終了時刻。end_at があればそれを使い、無ければ次に始まる行（同日内）との差で推定する。
 * どちらも無ければ null（呼び出し側が「出さない」「進行中扱い」を判断する）。
 * resolveTimetableDurations と resolveCurrentTimetableItemIds で同じ式を使うため、
 * ここに1本化する（跨日修正など、判定ルールの変更点を1箇所に保つため）。
 */
function endTimeOf(sorted: TimetableItem[], index: number, start: number): number | null {
  const item = sorted[index];

  return item.endAt ? timeOf(item.endAt) : nextStartAfter(sorted, index, start);
}

/**
 * 所要時間（分）。end_at があればそれを使う。
 * 無ければ次に始まる行との差で推定し、次が無ければ出さない。
 */
export function resolveTimetableDurations(items: TimetableItem[]): Record<string, number> {
  const sorted = sortTimetableItems(items);
  const durations: Record<string, number> = {};

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const start = timeOf(item.startAt);
    const end = endTimeOf(sorted, index, start);

    if (end === null) {
      continue;
    }

    durations[item.id] = Math.round((end - start) / 60000);
  }

  return durations;
}

/**
 * 「いまここ」の id 集合。二手に分かれている間は複数が同時に進行するため集合で返す。
 * 終了時刻を決められない行は、始まったあとも「その日のうち」は進行中のままにする。
 * 日をまたいで進行中扱いを続けると、前日の最後の行が翌朝まで進行中として残ってしまうため、
 * 終了時刻が分からない行の「進行中」は開始日の JST の日付が変わるまでに区切る。
 */
export function resolveCurrentTimetableItemIds(items: TimetableItem[], now: Date): Set<string> {
  const sorted = sortTimetableItems(items);
  const nowTime = now.getTime();
  const nowDateKey = jstDateFormatter.format(now);
  const current = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const start = timeOf(item.startAt);

    if (start > nowTime) {
      continue;
    }

    const end = endTimeOf(sorted, index, start);

    if (end === null) {
      if (toJstDateKey(item.startAt) === nowDateKey) {
        current.add(item.id);
      }
      continue;
    }

    if (end > nowTime) {
      current.add(item.id);
    }
  }

  return current;
}
