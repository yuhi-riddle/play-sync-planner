import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots.txt", () => {
  it("公開トークン付きページと内部ルートをクロール禁止にする", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallow = rules.flatMap((rule) => (Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]));

    expect(disallow).toContain("/s/");
    expect(disallow).toContain("/invites/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/auth/");
  });
});
