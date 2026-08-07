/**
 * JST 固定の日時ヘルパ。日付・時刻の解釈を実行環境の TZ に左右させないための唯一の入口。
 *
 * 開発機は JST、Vercel は UTC で動き、このプロジェクトは TZ を設定していない。
 * そのため `new Date("2026-07-15T10:00")`（オフセット無し＝ローカル解釈）や
 * `date.getDate()` のようなローカルゲッターを使うと、ローカルでは正しく動くのに
 * 本番だけ 9 時間ずれる、という気づきにくい壊れ方をする。
 *
 * 同じ処理が app/page.tsx の tokyoDateKey、lib/domain/plan-timetable.ts の
 * toJstDateKey、lib/actions/plan-timetable.ts の toJstTimestamp と
 * 3 箇所に別々に書かれていたので、ここに寄せた。
 */

/**
 * フォーマッタをモジュール直下ではなく呼び出しごとに作る。
 * 一度だけ作ると、timeZone の指定を消しても最初の生成時の TZ が焼き付いてしまい、
 * テストが process.env.TZ を差し替えても指定漏れを検出できなくなるため。
 */
function jstDateKeyFormatter() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

/** その瞬間が JST でいつの日付か。返り値は "YYYY-MM-DD"。 */
export function toJstDateKey(value: string | Date): string {
  return jstDateKeyFormatter().format(typeof value === "string" ? new Date(value) : value);
}

/**
 * JST の日付と時刻から絶対時刻を作る。DB は timestamptz なのでオフセットを明示する。
 * 例: ("2026-07-15", "10:00") -> "2026-07-15T01:00:00.000Z"
 */
export function jstIsoFromDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

/**
 * `<input type="datetime-local">` の生の値（"YYYY-MM-DDTHH:mm"、オフセット無し）を
 * JST として解釈して絶対時刻にする。
 *
 * この形式は「ユーザーが画面で見ている壁時計の時刻」であって、絶対時刻ではない。
 * サーバーでそのまま new Date() に渡すとサーバーの TZ で解釈されるため、必ずここを通す。
 */
export function jstIsoFromDateTimeLocal(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

/**
 * 同じ値を JST として解釈したミリ秒。形式が不正なら NaN を返し、例外は投げない。
 *
 * 入力検証（lib/validators.ts）は、形式エラーの行に対しても後段の比較を素通りさせる
 * 必要がある。ここで例外を投げると「YYYY-MM-DDTHH:mm 形式で入力してください」の
 * 代わりに RangeError が飛び、利用者に出るメッセージが変わってしまう。
 */
export function jstTimeFromDateTimeLocal(value: string): number {
  return new Date(`${value}:00+09:00`).getTime();
}
