import { describe, expect, it } from "vitest";

import { formatYenText } from "@/lib/format";

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
