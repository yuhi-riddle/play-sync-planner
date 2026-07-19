import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/020_event_list_performance_and_atomic_block.sql"
);
const hardeningMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/021_function_privilege_hardening.sql"
);

describe("event list performance and atomic block migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8");
  const hardeningMigration = () => readFileSync(hardeningMigrationPath, "utf8");

  it("returns ordered page ids and the full filtered count from one RPC", () => {
    const sql = migration();
    expect(sql).toContain("create or replace function public.list_owned_event_ids(");
    expect(sql).toContain("returns table(event_ids uuid[], total_count bigint)");
    expect(sql).toContain("e.owner_user_id = auth.uid()");
    expect(sql).toContain("owned_events as (");
    expect(sql).toContain("array_agg(id order by ordinal)");
    expect(sql).toContain("select count(*)::bigint from ordered");
  });

  it("uses a deterministic ordinal window and bounds the requested page", () => {
    const sql = migration();
    expect(sql).toContain("p_offset bigint default 0");
    expect(sql).toMatch(
      /greatest\(coalesce\(p_offset, 0::bigint\), 0::bigint\) as offset_value/
    );
    expect(sql).toMatch(
      /row_number\(\) over \([\s\S]*?created_at desc,\s+id desc\s+\) as ordinal/
    );
    expect(sql).toMatch(
      /where ordinal > offset_value\s+and ordinal <= offset_value \+ limit_value::bigint/
    );
  });

  it("keeps lifecycle, settlement, and schedule sorting rules in the database", () => {
    const sql = migration();
    expect(sql).toContain("p.status not in ('cancelled', 'skipped')");
    expect(sql).toContain("p.settlement_status = 'settling'");
    expect(sql).toContain("p.settlement_status = 'needed'");
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain("schedule_start");
  });

  it("blocks and removes both directions of relationships in one database function", () => {
    const sql = hardeningMigration();
    expect(sql).toContain("create or replace function public.block_user_atomic(target_user_id uuid)");
    expect(sql).toContain("insert into public.user_blocks");
    expect(sql).toContain("delete from public.user_connections");
    expect(sql).toContain("delete from public.user_favorites");
    expect(sql).toContain("private.have_shared_event(current_user_id, target_user_id)");
  });

  it("rejects unauthenticated, self, null, and unrelated block targets", () => {
    const sql = hardeningMigration();
    expect(sql).toMatch(
      /if current_user_id is null then\s+raise exception 'Authentication required';\s+end if;/
    );
    expect(sql).toMatch(
      /if target_user_id is null or target_user_id = current_user_id then\s+raise exception 'Invalid block target';\s+end if;/
    );
    expect(sql).toMatch(
      /if not private\.have_shared_event\(current_user_id, target_user_id\) then\s+raise exception using\s+errcode = 'PSP01',\s+message = 'A shared event is required';\s+end if;/
    );
  });

  it("keeps the list RPC restricted and adds query indexes", () => {
    const sql = migration();
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql).toContain("drop function if exists public.list_owned_event_ids(text, text, text, integer, integer)");
    expect(sql).toContain("revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint) from public");
    expect(sql).toContain("grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint) to authenticated");
    expect(sql).not.toContain("grant execute on function public.list_owned_event_ids(text, text, text, integer, integer)");
    expect(sql).toContain("events_owner_category_created_id_idx");
    expect(sql).toContain("plans_event_status_confirmed_idx");
  });

  it("keeps the refactored block RPC restricted to authenticated users", () => {
    const sql = hardeningMigration();
    expect(sql).toContain("revoke all on function public.block_user_atomic(uuid) from public");
    expect(sql).toContain("grant execute on function public.block_user_atomic(uuid) to authenticated");
  });
});
