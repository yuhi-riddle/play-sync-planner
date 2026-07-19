import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/021_function_privilege_hardening.sql"
);

describe("function privilege hardening migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8");

  it("creates private, hardened helpers that derive event access from auth.uid", () => {
    const sql = migration();

    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(sql).toContain("create schema if not exists private;");
    expect(sql).toContain("revoke all on schema private from public;");
    expect(sql).toContain("revoke all on schema private from anon;");
    expect(sql).toContain("grant usage on schema private to authenticated;");
    expect(sql).toContain("grant usage on schema private to service_role;");

    for (const signature of [
      /private\.is_event_owner\(target_event_id uuid\)/,
      /private\.is_joined_event_member\(target_event_id uuid\)/,
      /private\.have_shared_event\(\s*first_user_id uuid,\s*second_user_id uuid\s*\)/,
      /private\.is_user_blocked\(\s*first_user_id uuid,\s*second_user_id uuid\s*\)/,
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function\\s+${signature.source}`));
    }

    expect(sql.match(/returns boolean\s+language sql\s+stable\s+security definer\s+set search_path = ''/g)).toHaveLength(7);
    expect(sql).toContain("and public.events.owner_user_id = auth.uid()");
    expect(sql).toContain("and public.event_members.user_id = auth.uid()");
  });

  it("rewrites RLS policies and atomic blocking to use private helpers", () => {
    const sql = migration();

    expect(sql).toContain("using (private.is_joined_event_member(id));");
    expect(sql).toContain("using (private.is_event_owner(event_id))");
    expect(sql).toContain("private.have_shared_event(follower_user_id, followed_user_id)");
    expect(sql).toContain("not private.is_user_blocked(follower_user_id, followed_user_id)");
    expect(sql).toContain("private.have_shared_event(current_user_id, target_user_id)");
  });

  it("only lets relationship helpers inspect a relationship involving the caller", () => {
    const sql = migration();

    for (const [functionName, callerGuard] of [
      ["private.have_shared_event", "auth.uid() = first_user_id or auth.uid() = second_user_id"],
      ["private.is_user_blocked", "auth.uid() = first_user_id or auth.uid() = second_user_id"],
      ["public.have_shared_event", "auth.uid() = first_user_id or auth.uid() = second_user_id"],
      ["public.is_user_blocked", "auth.uid() = first_user_id or auth.uid() = second_user_id"],
      ["public.is_following", "auth.uid() = follower_id or auth.uid() = followed_id"],
    ]) {
      const match = sql.match(
        new RegExp(
          `create or replace function ${functionName.replace(".", "\\.")}\\([\\s\\S]*?as \\\$\\$([\\s\\S]*?)\\$\\$;`
        )
      );

      expect(match?.[1], `missing ${functionName} implementation`).toContain(
        callerGuard
      );
    }
  });

  it("keeps future private functions from inheriting public execution", () => {
    const sql = migration();

    expect(sql).toContain(
      "alter default privileges for role postgres in schema private revoke execute on functions from public;"
    );
    expect(sql).toContain(
      "alter default privileges for role postgres in schema private revoke execute on functions from anon;"
    );
    expect(sql).toContain(
      "alter default privileges for role postgres in schema private grant execute on functions to service_role;"
    );
  });

  it("allows only authenticated and service roles to execute hardened functions", () => {
    const sql = migration();
    const signatures = [
      "public.is_event_owner(uuid)",
      "public.is_joined_event_member(uuid)",
      "public.have_shared_event(uuid, uuid)",
      "public.is_user_blocked(uuid, uuid)",
      "public.is_following(uuid, uuid)",
      "public.list_owned_event_ids(text, text, text, integer, bigint)",
      "public.block_user_atomic(uuid)",
      "private.is_event_owner(uuid)",
      "private.is_joined_event_member(uuid)",
      "private.have_shared_event(uuid, uuid)",
      "private.is_user_blocked(uuid, uuid)",
    ];

    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
    }
  });
});
