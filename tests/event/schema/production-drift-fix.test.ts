import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/052_fix_production_drift.sql");
const originalPath = resolve(process.cwd(), "supabase/migrations/034_connection_calendar_rpc.sql");

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function listCalendarItemsBody(sql: string) {
  const start = sql.indexOf("function public.list_calendar_items(");
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd + 3);
}

// 本番の list_calendar_items は 034 の初版のまま残っていた（034 が適用後に書き換えられたため）。
// 052 は 034 の最終版をそのまま入れ直すだけで、中身を変えてはいけない。
describe("migration 052: reapply list_calendar_items", () => {
  it("exists", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("drops and recreates the function because the return columns change (create or replace cannot)", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("drop function if exists public.list_calendar_items(date);");
    expect(sql).toContain("create function public.list_calendar_items(");
    expect(sql.indexOf("drop function if exists public.list_calendar_items(date);")).toBeLessThan(
      sql.indexOf("create function public.list_calendar_items(")
    );
  });

  it("runs in one transaction so the function never disappears mid-apply", () => {
    const sql = read(migrationPath);

    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("drop function if exists public.list_calendar_items(date);"));
    expect(sql.lastIndexOf("commit;")).toBeGreaterThan(sql.lastIndexOf("grant execute on function public.list_calendar_items(date)"));
  });

  it("uses the final 034 definition verbatim (return columns and body)", () => {
    const sql = read(migrationPath);
    const original = read(originalPath);

    expect(sql).toContain("  location_name text,\n  start_at timestamptz,");
    expect(listCalendarItemsBody(sql)).toBe(listCalendarItemsBody(original));
  });

  it("keeps it a security definer with an empty search_path", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("stable\nsecurity definer\nset search_path = ''");
  });

  it("restores the grants that drop function resets", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("revoke all on function public.list_calendar_items(date) from public;");
    expect(sql).toContain("revoke all on function public.list_calendar_items(date) from anon;");
    expect(sql).toContain("grant execute on function public.list_calendar_items(date) to authenticated;");
    expect(sql).toContain("grant execute on function public.list_calendar_items(date) to service_role;");
  });

  // 030 は from public しか revoke しておらず、Supabase が anon へ直接付ける既定の EXECUTE が残っていた。
  it("revokes anon's direct execute on mark_plan_settling inside the same transaction", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("revoke all on function public.mark_plan_settling(uuid) from anon;");
    expect(sql.indexOf("revoke all on function public.mark_plan_settling(uuid) from anon;")).toBeLessThan(
      sql.lastIndexOf("commit;")
    );
  });
});
