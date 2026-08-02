import { describe, expect, it } from "vitest";

import { hasLegalConsentMark, LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";

describe("hasLegalConsentMark", () => {
  it("app_metadataに同意日時の文字列があればtrueを返す", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: "2026-07-10T00:00:00.000Z" })).toBe(true);
  });

  it("キーが無ければfalseを返す", () => {
    expect(hasLegalConsentMark({ provider: "google" })).toBe(false);
  });

  it("空文字はまだ同意していない扱いにする", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: "" })).toBe(false);
  });

  it("文字列以外が入っていてもfalseを返す", () => {
    expect(hasLegalConsentMark({ [LEGAL_CONSENT_METADATA_KEY]: 12345 })).toBe(false);
  });

  it("null や オブジェクト以外を渡してもクラッシュしない", () => {
    expect(hasLegalConsentMark(null)).toBe(false);
    expect(hasLegalConsentMark(undefined)).toBe(false);
    expect(hasLegalConsentMark("2026-07-10")).toBe(false);
  });
});
