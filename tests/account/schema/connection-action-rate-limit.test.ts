import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/039_connection_action_rate_limit.sql");

describe("connection action rate limit migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("centralizes the rate-limit-first, shared-event, block precondition in one private helper", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function private.require_connection_action_target(");
    const helperSection = sql.slice(
      sql.indexOf("function private.require_connection_action_target"),
      sql.indexOf("revoke all on function private.require_connection_action_target")
    );

    const rateLimitIndex = helperSection.indexOf(
      "retry_seconds := private.try_consume_authenticated_rate_limit_once(p_operation);"
    );
    const sharedEventIndex = helperSection.indexOf(
      "if not public.have_shared_event(current_user_id, p_target_user_id) then"
    );
    expect(rateLimitIndex).toBeGreaterThan(-1);
    expect(sharedEventIndex).toBeGreaterThan(-1);
    expect(rateLimitIndex).toBeLessThan(sharedEventIndex);

    expect(helperSection).toContain("errcode = 'PSP02'");
    expect(helperSection).toContain("errcode = 'PSP01'");
    expect(helperSection).toContain("errcode = 'PSP03'");
    expect(helperSection).toContain("message = 'Blocked relationship'");
    expect(sql).toContain("revoke all on function private.require_connection_action_target(uuid, text) from public");
  });

  it("has follow_user_atomic delegate to the shared helper and only audit when a row actually changed", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.follow_user_atomic(target_user_id uuid)");
    const followSection = sql.slice(
      sql.indexOf("function public.follow_user_atomic"),
      sql.indexOf("function public.unfollow_user_atomic")
    );

    expect(followSection).toContain(
      "current_user_id := private.require_connection_action_target(target_user_id, 'connection_update');"
    );
    expect(followSection).toContain(
      "insert into public.user_connections (follower_user_id, followed_user_id)\n  values (current_user_id, target_user_id)\n  on conflict (follower_user_id, followed_user_id) do nothing;"
    );
    expect(followSection).toContain("get diagnostics affected_rows = row_count;");
    expect(followSection).toContain("if affected_rows > 0 then");
    expect(followSection).toContain("values (current_user_id, 'connection_follow', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.follow_user_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.follow_user_atomic(uuid) to authenticated");
  });

  it("has unfollow_user_atomic delegate to the shared helper and only audit when a row actually changed", () => {
    const sql = migration();

    const unfollowSection = sql.slice(
      sql.indexOf("function public.unfollow_user_atomic"),
      sql.indexOf("function public.toggle_favorite_atomic")
    );

    expect(unfollowSection).toContain(
      "current_user_id := private.require_connection_action_target(target_user_id, 'connection_update');"
    );
    expect(unfollowSection).toContain(
      "delete from public.user_connections\n  where follower_user_id = current_user_id\n    and followed_user_id = target_user_id;"
    );
    expect(unfollowSection).toContain("get diagnostics affected_rows = row_count;");
    expect(unfollowSection).toContain("values (current_user_id, 'connection_unfollow', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.unfollow_user_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.unfollow_user_atomic(uuid) to authenticated");
  });

  it("guards toggle_favorite_atomic's insert with on conflict do nothing, avoiding a raw unique_violation on a double-click", () => {
    const sql = migration();

    const toggleSection = sql.slice(sql.indexOf("function public.toggle_favorite_atomic"));

    expect(toggleSection).toContain(
      "insert into public.user_favorites (user_id, favorite_user_id)\n    values (current_user_id, target_user_id)\n    on conflict (user_id, favorite_user_id) do nothing;"
    );
    expect(toggleSection).toContain("errcode = 'PSP04'");
    expect(toggleSection).toContain("message = 'Must be following to favorite'");
    expect(toggleSection).toContain("not already_favorite and not public.is_following(current_user_id, target_user_id)");
    expect(toggleSection).toContain("values (current_user_id, 'connection_favorite_add', 'user', target_user_id, 'success')");
    expect(toggleSection).toContain("values (current_user_id, 'connection_favorite_remove', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.toggle_favorite_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.toggle_favorite_atomic(uuid) to authenticated");
  });

  it("reuses the connection_update rate limit bucket already defined in migration 035, without redefining rate_limit_for", () => {
    const sql = migration();

    expect(sql).not.toContain("create or replace function private.rate_limit_for");
    expect(sql).toContain("try_consume_authenticated_rate_limit_once(p_operation)");
  });
});
