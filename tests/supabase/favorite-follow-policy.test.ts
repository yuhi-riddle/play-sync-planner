import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/018_require_follow_for_favorites.sql");

describe("favorite follow policy migration", () => {
  it("requires an outgoing follow before a favorite can be created", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("drop policy if exists \"Users can manage their own favorites\"");
    expect(migration).toContain("create or replace function public.is_following(");
    expect(migration).toContain("public.is_following(user_id, favorite_user_id)");
  });
});
