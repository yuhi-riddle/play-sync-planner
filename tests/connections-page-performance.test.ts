import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const pageSource = () => readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");

describe("connections page query performance", () => {
  it("uses the session client and starts the three bounded RPC reads together", () => {
    const source = pageSource();

    expect(source).not.toContain("createSupabaseAdminClient");
    expect(source).toContain("Promise.all");
    expect(source).toContain('rpc("get_connection_counts")');
    expect(source).toContain('rpc("list_received_event_invitations", { p_limit: 20 })');
    expect(source).toContain('rpc("list_connections",');
    expect(source).toContain("p_limit: 20");
    expect(source).not.toContain('from("event_members")');
    expect(source).not.toContain('from("user_blocks")');
  });

  it("validates the selected category and provides a loading boundary", () => {
    const source = pageSource();
    const loadingPath = resolve(process.cwd(), "app/connections/loading.tsx");

    expect(source).toContain("connectionCategorySchema.safeParse");
    expect(source).toContain(': "favorites"');
    expect(existsSync(loadingPath)).toBe(true);
    expect(readFileSync(loadingPath, "utf8")).toContain("animate-pulse");
  });
});
