import { describe, expect, it } from "vitest";

import { LEGAL_EFFECTIVE_DATE, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal-documents";

describe("法的文書の本文", () => {
  it("利用規約は8項目ある", () => {
    expect(TERMS_SECTIONS).toHaveLength(8);
  });

  it("プライバシーポリシーは9項目ある", () => {
    expect(PRIVACY_SECTIONS).toHaveLength(9);
  });

  it("節はすべて表題と本文を持つ", () => {
    for (const section of [...TERMS_SECTIONS, ...PRIVACY_SECTIONS]) {
      expect(section.title).toBeTruthy();
      expect(section.body).toBeTruthy();
    }
  });

  it("施行日を持つ", () => {
    expect(LEGAL_EFFECTIVE_DATE).toBe("2026年7月10日");
  });

  // 移設で本文が失われていないことの見張り。表題は既存テストが参照しているものと同じ。
  it("移設しても主要な節が残っている", () => {
    expect(TERMS_SECTIONS.map((section) => section.title)).toContain("3. 利用者の責任");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("4. 共有範囲");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("8. 退会と削除");
  });
});
