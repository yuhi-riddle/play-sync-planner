import { describe, expect, it } from "vitest";

import { WITHDRAWN_DISPLAY_NAME, isWithdrawalConfirmed } from "@/lib/domain/account/account";

describe("isWithdrawalConfirmed", () => {
  it("表示名が一致すれば確認済みとみなす", () => {
    expect(isWithdrawalConfirmed("あかり", "あかり")).toBe(true);
  });

  it("前後の空白は無視する", () => {
    expect(isWithdrawalConfirmed("  あかり  ", "あかり")).toBe(true);
  });

  it("表示名が違えば確認済みにしない", () => {
    expect(isWithdrawalConfirmed("あかりん", "あかり")).toBe(false);
  });

  it("未入力は確認済みにしない", () => {
    expect(isWithdrawalConfirmed(null, "あかり")).toBe(false);
    expect(isWithdrawalConfirmed("", "あかり")).toBe(false);
    expect(isWithdrawalConfirmed("   ", "あかり")).toBe(false);
  });

  it("表示名が空のアカウントを素通りさせない", () => {
    expect(isWithdrawalConfirmed("", "")).toBe(false);
  });
});

describe("WITHDRAWN_DISPLAY_NAME", () => {
  it("profiles_nickname_check の1〜40文字に収まる", () => {
    expect(WITHDRAWN_DISPLAY_NAME.trim().length).toBeGreaterThan(0);
    expect(WITHDRAWN_DISPLAY_NAME.trim().length).toBeLessThanOrEqual(40);
  });
});
