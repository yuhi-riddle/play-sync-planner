import { describe, expect, it } from "vitest";

import {
  ANSWER_DEADLINE_EXTENSION_DAYS,
  extendedAnswerDeadline,
  parseAnswerDeadlineExtensionDays
} from "@/lib/domain/plan/answer-deadline";

const now = new Date("2026-08-07T06:00:00.000Z");

describe("parseAnswerDeadlineExtensionDays", () => {
  it("選択肢の日数だけ通す", () => {
    for (const days of ANSWER_DEADLINE_EXTENSION_DAYS) {
      expect(parseAnswerDeadlineExtensionDays(String(days))).toBe(days);
    }
  });

  it("選択肢にない値は弾く", () => {
    // フォームの値は書き換えられる。365日延ばされると回答期限が実質無くなる
    expect(parseAnswerDeadlineExtensionDays("365")).toBeNull();
    expect(parseAnswerDeadlineExtensionDays("-3")).toBeNull();
    expect(parseAnswerDeadlineExtensionDays("2")).toBeNull();
    expect(parseAnswerDeadlineExtensionDays("")).toBeNull();
    expect(parseAnswerDeadlineExtensionDays(null)).toBeNull();
    expect(parseAnswerDeadlineExtensionDays("3日")).toBeNull();
  });
});

describe("extendedAnswerDeadline", () => {
  it("期限を過ぎているときは、今から数える", () => {
    // 元の期限に足すと、2日前 + 1日 = 1日前 で、延ばしても過去のまま
    const past = "2026-08-05T06:00:00.000Z";

    expect(extendedAnswerDeadline(past, 1, now)).toBe("2026-08-08T06:00:00.000Z");
  });

  it("まだ期限前なら、いまの期限から数える", () => {
    // 今から数えると期限が縮んでしまう
    const future = "2026-08-20T06:00:00.000Z";

    expect(extendedAnswerDeadline(future, 3, now)).toBe("2026-08-23T06:00:00.000Z");
  });

  it("期限が未設定なら今から数える", () => {
    expect(extendedAnswerDeadline(null, 7, now)).toBe("2026-08-14T06:00:00.000Z");
  });

  it("壊れた期限は未設定と同じ扱いにする", () => {
    expect(extendedAnswerDeadline("いつか", 1, now)).toBe("2026-08-08T06:00:00.000Z");
  });

  it("延ばした結果は必ず今より後になる", () => {
    for (const days of ANSWER_DEADLINE_EXTENSION_DAYS) {
      const result = new Date(extendedAnswerDeadline("2000-01-01T00:00:00.000Z", days, now));
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
