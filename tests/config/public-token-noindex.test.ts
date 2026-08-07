import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * トークン付きの公開URL(共有リンク・招待リンク)は、robots.txt を無視するクローラ対策として
 * ページ側にも noindex を明示する。
 */
const noindexPages = [
  "app/s/[token]/layout.tsx",
  "app/invites/[token]/page.tsx"
];

describe("公開トークンページのnoindex", () => {
  it("robots: { index: false } を持つ", () => {
    for (const file of noindexPages) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} にnoindex指定がありません`).toContain("index: false");
    }
  });
});
