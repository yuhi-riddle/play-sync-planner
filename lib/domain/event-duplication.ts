const COPY_SUFFIX = "（コピー）";
const DEFAULT_TITLE = "新しいイベント";

export type DuplicableEvent = {
  category: string | null;
  title: string | null;
  url: string | null;
  location_name: string | null;
  address: string | null;
  memo: string | null;
};

export type DuplicatedEvent = {
  category: string | null;
  title: string;
  url: string | null;
  location_name: string | null;
  address: string | null;
  memo: string | null;
  start_date: null;
  end_date: null;
  price: null;
  capacity: null;
  status: "interested";
  owner_user_id: string;
};

/** 何度複製しても「（コピー）」が積み上がらないようにする。 */
export function duplicatedEventTitle(title: string | null): string {
  const base = (title ?? "").trim() || DEFAULT_TITLE;
  return base.endsWith(COPY_SUFFIX) ? base : `${base}${COPY_SUFFIX}`;
}

/**
 * 「同じメンバーでまた遊ぶ」ための複製。
 * 場所や持ち物のメモは使い回せるが、日付・金額・進行状態は毎回変わるので引き継がない。
 */
export function buildDuplicatedEvent(source: DuplicableEvent, ownerUserId: string): DuplicatedEvent {
  return {
    category: source.category,
    title: duplicatedEventTitle(source.title),
    url: source.url,
    location_name: source.location_name,
    address: source.address,
    memo: source.memo,
    start_date: null,
    end_date: null,
    price: null,
    capacity: null,
    status: "interested",
    owner_user_id: ownerUserId
  };
}
