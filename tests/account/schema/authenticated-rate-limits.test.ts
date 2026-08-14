import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/035_authenticated_rate_limits.sql");

describe("authenticated rate limit and audit log foundation migration", () => {
  // core.autocrlf=true な環境ではチェックアウトのたびにCRLF化されるため、
  // 複数行のtoContainアサーションが壊れないよう正規化する。
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("creates rate limit buckets and security audit logs, locked down from every client role", () => {
    const sql = migration();

    expect(sql).toContain("create table private.rate_limit_buckets (");
    expect(sql).toContain("primary key (operation, subject_hash, window_started_at)");
    expect(sql).toContain("create table private.security_audit_logs (");
    expect(sql).toContain("outcome text not null check (outcome in ('success', 'denied'))");
    expect(sql).toContain(
      "revoke all on table private.rate_limit_buckets from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "revoke all on table private.security_audit_logs from public, anon, authenticated, service_role"
    );
  });

  it("limits rate_limit_for to only the operations wired up in this migration", () => {
    const sql = migration();

    expect(sql).toContain("when 'event_message_post' then 20");
    expect(sql).toContain("when 'event_invitation_create' then 30");
    expect(sql).toContain("when 'event_invitation_respond' then 30");
    expect(sql).toContain("when 'connection_update' then 30");
    expect(sql).not.toContain("public_answer");
    expect(sql).not.toContain("public_payment");
  });

  it("hashes auth.uid() with the bare digest() already proven in migration 033, not extensions.digest()", () => {
    const sql = migration();

    expect(sql).toContain("digest(current_user_id::text, 'sha256')");
    expect(sql).not.toContain("extensions.digest");
  });

  it("caches the rate limit result per statement setting so one transaction only ever consumes once", () => {
    const sql = migration();

    expect(sql).toContain("setting_name text := 'request.rate_limit_' || p_operation");
    expect(sql).toContain("perform set_config(setting_name, retry_seconds::text, true)");
  });

  it("does not bring in the blanket 24-table trigger, the service-role-only public rate limiter, or record_security_audit", () => {
    const sql = migration();

    expect(sql).not.toContain("create or replace function private.enforce_authenticated_rate_limit");
    expect(sql).not.toContain("create or replace function public.consume_public_rate_limit");
    expect(sql).not.toContain("create or replace function public.record_security_audit");
  });

  it("purges old rate limit and audit rows, service_role only", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.purge_expired_security_data()");
    expect(sql).toContain("where window_started_at < clock_timestamp() - interval '90 days'");
    expect(sql).toContain("where created_at < clock_timestamp() - interval '90 days'");
    expect(sql).toContain("revoke all on function public.purge_expired_security_data() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.purge_expired_security_data() to service_role");
  });

  it("extends block_user_atomic with a rate limit check and a success audit log entry, keeping the existing mutation logic", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.block_user_atomic(target_user_id uuid)");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("if not public.have_shared_event(current_user_id, target_user_id) then");
    expect(sql).toContain("errcode = 'PSP01'");
    expect(sql).toContain("retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update')");
    expect(sql).toContain("errcode = 'PSP02'");
    expect(sql).toContain("insert into public.user_blocks (blocker_user_id, blocked_user_id)");
    expect(sql).toContain(
      "insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)"
    );
    expect(sql).toContain("values (current_user_id, 'connection_block', 'user', target_user_id, 'success')");
  });

  it("closes the same anon-execute gap migration 032 fixed for other functions, since the security probe deliberately skips mutating functions", () => {
    const sql = migration();

    expect(sql).toContain("revoke all on function public.block_user_atomic(uuid) from anon");
  });
});
