import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDateTimeRange,
  formatJstTime,
  formatTime,
  formatYenText,
  toDateTimeLocalValue
} from "@/lib/shared/format";

/**
 * 本番(Vercel)は UTC、開発機は JST。TZ を差し替えないと開発機ではずれようが無く、
 * timeZone の指定漏れを検出できない（テストが素通りする）。
 */
function withTz<T>(timeZone: string, run: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    process.env.TZ = original;
  }
}

describe("formatYenText", () => {
  it("3桁区切りで金額に円を付ける", () => {
    expect(formatYenText(1000)).toBe("1,000円");
  });

  it("大きな金額でも3桁ごとに区切る", () => {
    expect(formatYenText(1234567)).toBe("1,234,567円");
  });

  it("0円をそのまま表示する", () => {
    expect(formatYenText(0)).toBe("0円");
  });
});

describe("formatJstTime", () => {
  /**
   * 開発機は JST なので、timeZone の指定を消しても出力が偶然一致してしまう。
   * 本番の Vercel は UTC なので、その環境を再現しないとこの関数の存在意義を検証できない。
   */
  function withTimeZone(timeZone: string, run: () => void) {
    const original = process.env.TZ;
    process.env.TZ = timeZone;
    try {
      run();
    } finally {
      process.env.TZ = original;
    }
  }

  it("実行環境がUTCでもJSTの時刻を返す", () => {
    // 2026-08-15T04:00Z は JST 13:00。timeZone を消すと UTC 解釈で 04:00 になる。
    withTimeZone("UTC", () => {
      expect(formatJstTime("2026-08-15T04:00:00+00:00")).toBe("13:00");
    });
  });

  it("実行環境がUTCでも日をまたぐ時刻をJSTで返す", () => {
    // 2026-08-15T17:00Z = JST 翌 02:00。timeZone を消すと 17:00 になる。
    withTimeZone("UTC", () => {
      expect(formatJstTime("2026-08-15T17:00:00+00:00")).toBe("02:00");
    });
  });

  it("実行環境のTZに関係なくJSTの時刻を返す", () => {
    // 2026-08-15T04:00Z は JST 13:00。UTC 環境で動かしても 13:00 にならなければならない。
    expect(formatJstTime("2026-08-15T04:00:00+00:00")).toBe("13:00");
  });

  it("日をまたぐ時刻も JST で返す", () => {
    // 2026-08-15T17:00Z = JST 翌 02:00。
    expect(formatJstTime("2026-08-15T17:00:00+00:00")).toBe("02:00");
  });

  it("未設定は未設定と出す", () => {
    expect(formatJstTime(null)).toBe("未設定");
  });
});

describe("表示フォーマットの TZ 固定", () => {
  // JST 2026-07-15 10:00 = UTC 2026-07-15 01:00
  const morning = "2026-07-15T10:00:00+09:00";
  // JST 2026-07-15 01:00 = UTC 2026-07-14 16:00（日付までまたぐ）
  const lateNight = "2026-07-15T01:00:00+09:00";

  it("formatDateTime はサーバーが UTC でも JST で出す", () => {
    expect(withTz("UTC", () => formatDateTime(morning))).toBe(withTz("Asia/Tokyo", () => formatDateTime(morning)));
    expect(withTz("UTC", () => formatDateTime(morning))).toContain("10:00");
  });

  it("formatTime はサーバーが UTC でも JST で出す", () => {
    expect(withTz("UTC", () => formatTime(morning))).toContain("10:00");
  });

  it("formatDate は日付をまたぐ時刻でも JST の日で出す", () => {
    // UTC 解釈だと 7月14日 になる。
    expect(withTz("UTC", () => formatDate(lateNight))).toBe(withTz("Asia/Tokyo", () => formatDate(lateNight)));
    expect(withTz("UTC", () => formatDate(lateNight))).toContain("15");
  });

  it("formatDateTimeRange の同日判定を JST で行う", () => {
    // JST では 7/15 の 10:00-13:00（同日）。UTC 解釈でも同日なので、
    // 日付をまたぐ側（JST 7/14 23:00 - 7/15 01:00）で両方向を固定する。
    const sameDay = withTz("UTC", () => formatDateTimeRange(morning, "2026-07-15T13:00:00+09:00"));
    expect(sameDay).toContain("10:00");
    expect(sameDay).toContain("13:00");

    // またぐ側: 終了だけ翌日なので、終了側も日付付きで出る必要がある。
    const crossing = withTz("UTC", () => formatDateTimeRange("2026-07-14T23:00:00+09:00", lateNight));
    expect(crossing).toBe(withTz("Asia/Tokyo", () => formatDateTimeRange("2026-07-14T23:00:00+09:00", lateNight)));
  });

  it("toDateTimeLocalValue は保存済みの時刻を JST の壁時計に戻す", () => {
    // 編集フォームの初期値。UTC で動くとサーバーが 01:00 を入れてしまい、
    // そのまま保存されると候補が 9 時間ずれる。
    expect(withTz("UTC", () => toDateTimeLocalValue(morning))).toBe("2026-07-15T10:00");
    expect(withTz("Asia/Tokyo", () => toDateTimeLocalValue(morning))).toBe("2026-07-15T10:00");
  });
});

describe("オフセット無しの日時文字列の解釈", () => {
  // <input type="datetime-local"> の生の値。ユーザーが画面で見ている JST の壁時計であって
  // 絶対時刻ではない。実行環境の TZ で解釈すると、本番(UTC)のサーバー描画だけ 9 時間ずれる。
  // 実際に TZ=UTC の dev サーバーで /plans/[id]/edit を開いたところ、サーバーが
  // 「2026/08/15 19:00 - 21:00」を描き、JST のブラウザが 10:00 に描き直して
  // ハイドレーション不一致になっていた。
  const naive = "2026-08-15T10:00";
  const naiveEnd = "2026-08-15T12:00";

  it("formatDateTime はオフセット無しの値を JST の壁時計として読む", () => {
    expect(withTz("UTC", () => formatDateTime(naive))).toContain("10:00");
    expect(withTz("UTC", () => formatDateTime(naive))).toBe(withTz("Asia/Tokyo", () => formatDateTime(naive)));
  });

  it("formatDateTimeRange も同じ", () => {
    const utc = withTz("UTC", () => formatDateTimeRange(naive, naiveEnd));
    expect(utc).toContain("10:00");
    expect(utc).toContain("12:00");
    expect(utc).toBe(withTz("Asia/Tokyo", () => formatDateTimeRange(naive, naiveEnd)));
  });

  it("オフセット付きの値は今までどおり絶対時刻として扱う", () => {
    // 誤って全部 +09:00 を足してしまうと、こちらが 19:00 になって壊れる。
    expect(withTz("UTC", () => formatDateTime("2026-08-15T01:00:00+00:00"))).toContain("10:00");
    expect(withTz("UTC", () => formatDateTime("2026-08-15T01:00:00Z"))).toContain("10:00");
  });
});
