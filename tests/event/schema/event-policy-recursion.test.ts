import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/015_fix_event_policy_recursion.sql");

describe("event membership RLS repair migration", () => {
  it("uses security definer membership checks instead of mutually-recursive table policies", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.is_event_owner");
    expect(migration).toContain("create or replace function public.is_joined_event_member");
    expect(migration).toContain("security definer");
    expect(migration).toContain("using (public.is_event_owner(event_id))");
    expect(migration).toContain("using (public.is_joined_event_member(id))");
  });
});
