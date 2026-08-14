import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("connections page query count", () => {
  it("does not load blocked users one by one from the auth admin API", () => {
    const source = readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");
    expect(source).not.toContain("getUserById");
    expect(source).not.toContain("fallbackEntries");
  });

  it("loads connections, counts, and blocked users through the migration 034 RPCs instead of scanning connection tables", () => {
    const source = readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");
    expect(source).toContain('supabase.rpc("get_connection_counts")');
    expect(source).toContain('supabase.rpc("list_connections"');
    expect(source).not.toContain('from("user_connections")');
    expect(source).not.toContain('from("user_blocks")');
    expect(source).not.toContain('from("user_favorites")');
  });
});
