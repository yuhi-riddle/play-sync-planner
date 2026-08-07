import { toJstDate } from "@/lib/shared/jst";

const unsetLabel = "未設定";

/**
 * このアプリの日時表示は JST 固定。
 *
 * 本番(Vercel)の Node.js ランタイムは UTC で、プロジェクトに TZ 設定は無い。
 * timeZone を指定しないと実行環境に従うため、開発機(JST)では正しく見えるのに
 * 本番だけ 9 時間ずれる。サーバーコンポーネントの描画結果は再読込しても直らない。
 *
 * フォーマッタを呼び出しごとに作るのは、モジュール読み込み時に固めると
 * テストが process.env.TZ を差し替えても効かず、timeZone の指定漏れを検出できないため。
 */
const JST = "Asia/Tokyo";

function jstFormat(value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: JST, ...options }).format(toJstDate(value));
}

/** JST でのカレンダー上の日付。同日判定に使う（ローカルゲッターだと TZ でずれる）。 */
function jstDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(toJstDate(value));
}

export function formatYenText(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}円`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return jstFormat(value, { dateStyle: "medium" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return jstFormat(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return jstFormat(value, { timeStyle: "short" });
}

/**
 * 24時間表記・ゼロ埋めの時刻（"09:05"）。
 *
 * formatTime との違いは表記だけで、どちらも JST 固定。
 * 進行表は <input type="time"> の値と突き合わせるのでゼロ埋めが要る。
 */
export function formatJstTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JST,
    hour: "2-digit",
    minute: "2-digit"
  }).format(toJstDate(value));
}

export function formatDateTimeRange(start: string | null | undefined, end: string | null | undefined, isAllDay = false): string {
  if (!start) {
    return unsetLabel;
  }

  if (isAllDay) {
    return formatAllDayRange(start, end);
  }

  if (!end) {
    return formatDateTime(start);
  }

  const sameDay = jstDateKey(start) === jstDateKey(end);

  return sameDay ? `${formatDateTime(start)} - ${formatTime(end)}` : `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function formatAllDayRange(start: string, end: string | null | undefined): string {
  const startLabel = formatDate(start);
  if (!end) {
    return `${startLabel} 終日`;
  }

  const inclusiveEndDate = new Date(toJstDate(end).getTime() - 24 * 60 * 60 * 1000);
  const sameDay = jstDateKey(start) === jstDateKey(inclusiveEndDate);

  return sameDay ? `${startLabel} 終日` : `${startLabel} - ${formatDate(inclusiveEndDate.toISOString())} 終日`;
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  // <input type="datetime-local"> に入れる「JST の壁時計」の文字列。
  // getTimezoneOffset() を使うと実行環境の TZ になり、本番(UTC)では
  // 保存済みの 10:00 が 01:00 として初期表示され、そのまま保存すると値が壊れる。
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(toJstDate(value));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}
