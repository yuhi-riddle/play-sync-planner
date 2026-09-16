import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/050_connection_active_shared_events.sql"
);

describe("connection active shared events migration", () => {
  it("creates the event_activity_state view with is_active and display_state", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace view public.event_activity_state");
    expect(migration).toContain("as is_active");
    expect(migration).toContain("as display_state");
    expect(migration).toContain("'settlement_waiting'");
    expect(migration).toContain("'schedule_creation_waiting'");
    expect(migration).toContain("revoke all on table public.event_activity_state from anon, authenticated;");
  });

  it("creates list_active_shared_events with a block check", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.list_active_shared_events(");
    expect(migration).toContain("p_other_user_id uuid");
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public.user_blocks as relationship_block");
    expect(migration).toContain("and activity.is_active");
  });

  it("drops and recreates list_connections with active_shared_event_count", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("drop function if exists public.list_connections(text, timestamptz, uuid, integer);");
    expect(migration).toContain("active_shared_event_count bigint");
    expect(migration).toContain("count(*) filter (where activity.is_active)::bigint as active_shared_event_count");
  });
});
