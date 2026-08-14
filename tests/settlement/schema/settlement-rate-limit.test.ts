import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/038_settlement_rate_limit.sql");

describe("settlement rate limit migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("adds settlement_update to rate_limit_for without touching the existing operations", () => {
    const sql = migration();

    expect(sql).toContain("when 'event_message_post' then 20");
    expect(sql).toContain("when 'event_invitation_create' then 30");
    expect(sql).toContain("when 'event_invitation_respond' then 30");
    expect(sql).toContain("when 'connection_update' then 30");
    expect(sql).toContain("when 'settlement_update' then 30");
  });

  it("exposes a thin authenticated rate-limit gate that returns jsonb instead of embedding business logic", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.consume_authenticated_rate_limit(p_operation text)");
    expect(sql).toContain("returns jsonb");
    expect(sql).toContain("retry_seconds := private.try_consume_authenticated_rate_limit_once(p_operation)");
    expect(sql).toContain("return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds)");
    expect(sql).toContain("revoke all on function public.consume_authenticated_rate_limit(text) from public, anon");
    expect(sql).toContain("grant execute on function public.consume_authenticated_rate_limit(text) to authenticated");
  });

  it("lets an authenticated caller record its own audit entry without a service-role gate, deriving actor_user_id from auth.uid()", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.record_authenticated_security_audit(");
    expect(sql).toContain("current_user_id uuid := auth.uid()");
    expect(sql).toContain("raise exception 'Authentication required'");
    expect(sql).toContain("values (current_user_id, p_operation, p_target_type, p_target_id, p_outcome)");
    expect(sql).toContain("if p_operation not in ('settlement_payment_record', 'settlement_payment_confirm') then");
    expect(sql).toContain("revoke all on function public.record_authenticated_security_audit(text, text, uuid, text) from public, anon");
    expect(sql).toContain("grant execute on function public.record_authenticated_security_audit(text, text, uuid, text) to authenticated");
  });

  it("does not port record_settlement_payment/record_public_settlement_payment/confirm_settlement_payment/get_settlement_page_data", () => {
    const sql = migration();

    expect(sql).not.toContain("create or replace function public.record_settlement_payment(");
    expect(sql).not.toContain("create or replace function public.record_public_settlement_payment(");
    expect(sql).not.toContain("create or replace function public.confirm_settlement_payment(");
    expect(sql).not.toContain("create or replace function public.get_settlement_page_data(");
  });
});
