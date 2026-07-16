import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("connections page query count", () => {
  it("does not load blocked users one by one from the auth admin API", () => {
    const source = readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");
    expect(source).not.toContain("getUserById");
    expect(source).not.toContain("fallbackEntries");
    expect(source).toContain('from("profiles").select("user_id, nickname")');
  });
});
