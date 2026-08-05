import { describe, expect, it } from "vitest";

import { formatJstTime, formatYenText } from "@/lib/format";

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
