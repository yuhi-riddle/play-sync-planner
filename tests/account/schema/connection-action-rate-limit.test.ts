import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/039_connection_action_rate_limit.sql");

describe("connection action rate limit migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("gives follow_user_atomic the same rate-limit-first, shared-event, block checks as block_user_atomic", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.follow_user_atomic(target_user_id uuid)");
    const rateLimitIndex = sql.indexOf(
      "retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');",
      sql.indexOf("function public.follow_user_atomic")
    );
    const sharedEventIndex = sql.indexOf(
      "if not public.have_shared_event(current_user_id, target_user_id) then",
      sql.indexOf("function public.follow_user_atomic")
    );
    expect(rateLimitIndex).toBeGreaterThan(-1);
    expect(sharedEventIndex).toBeGreaterThan(-1);
    expect(rateLimitIndex).toBeLessThan(sharedEventIndex);

    expect(sql).toContain("errcode = 'PSP03'");
    expect(sql).toContain("message = 'Blocked relationship'");
    expect(sql).toContain(
      "insert into public.user_connections (follower_user_id, followed_user_id)\n  values (current_user_id, target_user_id)\n  on conflict (follower_user_id, followed_user_id) do nothing;"
    );
    expect(sql).toContain("values (current_user_id, 'connection_follow', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.follow_user_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.follow_user_atomic(uuid) to authenticated");
  });

  it("keeps unfollow_user_atomic behind the same shared-event and block checks as before (no behavior loosening)", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.unfollow_user_atomic(target_user_id uuid)");
    const unfollowSection = sql.slice(
      sql.indexOf("function public.unfollow_user_atomic"),
      sql.indexOf("function public.toggle_favorite_atomic")
    );
    expect(unfollowSection).toContain("if not public.have_shared_event(current_user_id, target_user_id) then");
    expect(unfollowSection).toContain("if public.is_user_blocked(current_user_id, target_user_id) then");
    expect(unfollowSection).toContain(
      "delete from public.user_connections\n  where follower_user_id = current_user_id\n    and followed_user_id = target_user_id;"
    );
    expect(unfollowSection).toContain("values (current_user_id, 'connection_unfollow', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.unfollow_user_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.unfollow_user_atomic(uuid) to authenticated");
  });

  it("keeps the follow-required-for-favorite rule, using the existing is_following helper", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.toggle_favorite_atomic(target_user_id uuid)");
    expect(sql).toContain("errcode = 'PSP04'");
    expect(sql).toContain("message = 'Must be following to favorite'");
    expect(sql).toContain("not already_favorite and not public.is_following(current_user_id, target_user_id)");
    expect(sql).toContain("values (current_user_id, 'connection_favorite_add', 'user', target_user_id, 'success')");
    expect(sql).toContain("values (current_user_id, 'connection_favorite_remove', 'user', target_user_id, 'success')");
    expect(sql).toContain("revoke all on function public.toggle_favorite_atomic(uuid) from public, anon");
    expect(sql).toContain("grant execute on function public.toggle_favorite_atomic(uuid) to authenticated");
  });

  it("reuses the connection_update rate limit bucket already defined in migration 035, without redefining rate_limit_for", () => {
    const sql = migration();

    expect(sql).not.toContain("create or replace function private.rate_limit_for");
    expect(sql).toContain("try_consume_authenticated_rate_limit_once('connection_update')");
  });
});
