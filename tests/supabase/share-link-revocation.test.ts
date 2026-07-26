import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/022_share_link_revocation.sql");

describe("share link revocation migration", () => {
  it("adds a revocable status to share_links", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("alter table public.share_links");
    expect(migration).toContain("status text not null default 'open'");
    expect(migration).toContain("revoked_at timestamptz");
    expect(migration).toContain("check (status in ('open', 'revoked'))");
  });

  it("keeps at most one open link per plan and purpose", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create unique index");
    expect(migration).toContain("on public.share_links(plan_id, purpose)");
    expect(migration).toContain("where status = 'open'");
  });
});
