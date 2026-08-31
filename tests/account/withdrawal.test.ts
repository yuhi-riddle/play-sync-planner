import { describe, expect, it } from "vitest";

import { isWithdrawn, WITHDRAWAL_METADATA_KEY } from "@/lib/domain/account/withdrawal";

describe("isWithdrawn", () => {
  it("app_metadataに退会日時の文字列があればtrueを返す", () => {
    expect(isWithdrawn({ [WITHDRAWAL_METADATA_KEY]: "2026-08-30T00:00:00.000Z" })).toBe(true);
  });

  it("キーが無ければfalseを返す", () => {
    expect(isWithdrawn({ provider: "google" })).toBe(false);
  });

  it("空文字は退会していない扱いにする", () => {
    expect(isWithdrawn({ [WITHDRAWAL_METADATA_KEY]: "" })).toBe(false);
  });

  it("文字列以外が入っていてもfalseを返す", () => {
    expect(isWithdrawn({ [WITHDRAWAL_METADATA_KEY]: 12345 })).toBe(false);
  });

  it("null や オブジェクト以外を渡してもクラッシュしない", () => {
    expect(isWithdrawn(null)).toBe(false);
    expect(isWithdrawn(undefined)).toBe(false);
    expect(isWithdrawn("2026-08-30")).toBe(false);
  });
});
