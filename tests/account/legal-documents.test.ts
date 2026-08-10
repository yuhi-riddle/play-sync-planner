import { describe, expect, it } from "vitest";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR_NAME,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS
} from "@/lib/domain/account/legal-documents";

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
    expect(LEGAL_EFFECTIVE_DATE).toBe("2026年8月11日");
  });

  /*
   * 問い合わせ先が無い規約は、何かあったときに利用者の行き先が無い。
   * 「窓口の公開後に受け付けます」という以前の書き方に戻っていないことも見る。
   */
  it("規約とポリシーの両方に、運営者と問い合わせ先を書く", () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      const body = sections.map((section) => section.body).join("\n");

      expect(body).toContain(LEGAL_OPERATOR_NAME);
      expect(body).toContain(LEGAL_CONTACT_EMAIL);
      expect(body).not.toContain("正式な問い合わせ窓口の公開後");
    }
  });

  /*
   * migration 030 以降、共有リンクはトークンを知っているだけでは開けない。
   * 「リンクを受け取った人に表示されます」は実態より広く読める書き方になっていた。
   */
  it("共有リンクの説明が、ログインと参加者であることを前提にしている", () => {
    const shareSection = PRIVACY_SECTIONS.find((section) => section.title === "4. 共有範囲");
    expect(shareSection, "共有範囲の節が見つからない").toBeDefined();

    expect(shareSection!.body).toContain("リンクを知っているだけでは開けません");
    expect(shareSection!.body).not.toContain("リンクを受け取った人に");
  });

  // ゲスト参加を廃止したので、ログインせずに使える機能はもう無い。
  it("規約の適用範囲が、ログイン必須であることを書いている", () => {
    const scopeSection = TERMS_SECTIONS.find((section) => section.title === "1. 適用");
    expect(scopeSection, "適用の節が見つからない").toBeDefined();

    expect(scopeSection!.body).toContain("ログインせずに使える機能はありません");
  });

  // 移設で本文が失われていないことの見張り。表題は既存テストが参照しているものと同じ。
  it("移設しても主要な節が残っている", () => {
    expect(TERMS_SECTIONS.map((section) => section.title)).toContain("3. 利用者の責任");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("4. 共有範囲");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("8. 退会と削除");
  });
});
