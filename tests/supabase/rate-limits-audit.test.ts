import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/023_rate_limits_and_security_audit.sql"
);

function migration() {
  return readFileSync(migrationPath, "utf8");
}

function functionDefinition(sql: string, name: string) {
  const match = sql.match(
    new RegExp(
      `create or replace function\\s+(?:public|private)\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
      "i"
    )
  );
  expect(match?.[0], `missing ${name} definition`).toBeTruthy();
  return match?.[0] ?? "";
}

describe("rate limits and security audit migration", () => {
  it("exists as migration 023 and is one additive transaction", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = migration();
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(sql).not.toMatch(/\b(drop table|drop schema|truncate)\b/i);
  });

  it("creates only the minimal private bucket and audit columns", () => {
    const sql = migration();
    const bucket = sql.match(
      /create table private\.rate_limit_buckets\s*\(([\s\S]*?)\n\);/i
    )?.[1];
    const audit = sql.match(
      /create table private\.security_audit_logs\s*\(([\s\S]*?)\n\);/i
    )?.[1];

    expect(bucket).toBeTruthy();
    expect(bucket).toContain("operation text not null");
    expect(bucket).toContain("subject_hash bytea not null");
    expect(bucket).toContain("window_started_at timestamptz not null");
    expect(bucket).toContain("request_count integer not null check (request_count > 0)");
    expect(bucket).toContain("primary key (operation, subject_hash, window_started_at)");

    expect(audit).toBeTruthy();
    expect(audit).toContain("id bigint generated always as identity primary key");
    expect(audit).toContain("actor_user_id uuid");
    expect(audit).toContain("operation text not null");
    expect(audit).toContain("target_type text not null");
    expect(audit).toContain("target_id uuid");
    expect(audit).toContain("outcome text not null check (outcome in ('success', 'denied'))");
    expect(audit).toContain("created_at timestamptz not null default now()");
    expect(`${bucket}\n${audit}`).not.toMatch(
      /\b(body|message|content|token|cookie|ip|url|user_agent|useragent|raw_identifier)\b/i
    );
  });

  it("revokes direct access to private security data", () => {
    const sql = migration();
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on table private.rate_limit_buckets from ${role};`);
      expect(sql).toContain(`revoke all on table private.security_audit_logs from ${role};`);
    }
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete|all).*private\.(?:rate_limit_buckets|security_audit_logs)/i);
  });

  it("uses the fixed operation allowlist and 60-second limits", () => {
    const sql = migration();
    const limits = new Map<string, number>([
      ["event_message_post", 20],
      ["google_availability", 6],
      ["connection_update", 30],
      ["event_invitation_create", 30],
      ["event_invitation_respond", 30],
      ["event_update", 30],
      ["plan_update", 30],
      ["event_member_update", 30],
      ["profile_update", 30],
      ["settlement_update", 30],
      ["google_calendar_update", 30],
      ["public_answer", 10],
      ["public_payment", 10]
    ]);

    for (const [operation, limit] of limits) {
      expect(sql).toMatch(new RegExp(`when '${operation}' then ${limit}\\b`));
    }
    expect(sql).toMatch(/extract\(epoch from clock_timestamp\(\)\)[\s\S]*60/i);
  });

  it("increments a fixed-window bucket atomically and offers a nonthrowing decision", () => {
    const sql = migration();
    const tryConsume = functionDefinition(sql, "try_consume_rate_limit");
    const consume = functionDefinition(sql, "consume_rate_limit");
    expect(tryConsume).toContain("insert into private.rate_limit_buckets");
    expect(tryConsume).toMatch(/on conflict\s*\(operation, subject_hash, window_started_at\)\s*do update/i);
    expect(tryConsume).toMatch(/request_count\s*=\s*private\.rate_limit_buckets\.request_count\s*\+\s*1/i);
    expect(tryConsume).toMatch(/returning request_count into/i);
    expect(tryConsume).toMatch(/return\s+(?:0|retry_seconds)/i);
    expect(tryConsume).not.toContain("errcode = 'PSP02'");
    expect(consume).toContain("private.try_consume_rate_limit");
    expect(consume).toContain("errcode = 'PSP02'");
    expect(tryConsume).toMatch(/greatest\(\s*1,\s*least\(\s*60,/i);
  });

  it("enforces authenticated limits from transaction-local DML triggers", () => {
    const sql = migration();
    const triggerFunction = functionDefinition(sql, "enforce_authenticated_rate_limit");
    expect(triggerFunction).toContain("auth.role() = 'authenticated'");
    expect(triggerFunction).toContain("private.consume_authenticated_rate_limit_once");

    const tryOnce = functionDefinition(sql, "try_consume_authenticated_rate_limit_once");
    expect(tryOnce).toContain("current_setting(");
    expect(tryOnce).toContain("set_config(");
    expect(tryOnce).toContain("private.try_consume_rate_limit");
    const once = functionDefinition(sql, "consume_authenticated_rate_limit_once");
    expect(once).toContain("private.try_consume_authenticated_rate_limit_once");
    expect(once).toContain("errcode = 'PSP02'");

    const protectedTables = new Map<string, string>([
      ["events", "event_update"],
      ["event_drafts", "event_update"],
      ["plans", "plan_update"],
      ["candidate_dates", "plan_update"],
      ["participants", "plan_update"],
      ["share_links", "plan_update"],
      ["availability_answers", "plan_update"],
      ["plan_reminder_settings", "plan_update"],
      ["plan_reminder_logs", "plan_update"],
      ["event_members", "event_member_update"],
      ["event_invite_links", "event_member_update"],
      ["event_messages", "event_message_post"],
      ["user_connections", "connection_update"],
      ["user_favorites", "connection_update"],
      ["user_blocks", "connection_update"],
      ["profiles", "profile_update"],
      ["user_consents", "profile_update"],
      ["expenses", "settlement_update"],
      ["expense_splits", "settlement_update"],
      ["settlements", "settlement_update"],
      ["settlement_payments", "settlement_update"],
      ["payment_proofs", "settlement_update"],
      ["settlement_reminder_logs", "settlement_update"],
      ["calendar_integrations", "google_calendar_update"]
    ]);

    for (const [table, operation] of protectedTables) {
      expect(sql, table).toMatch(
        new RegExp(
          `create trigger rate_limit_${table}\\s+before (?:insert or update or delete|insert|update|delete) on public\\.${table}\\s+for each statement\\s+execute function private\\.enforce_authenticated_rate_limit\\('${operation}'\\);`,
          "i"
        )
      );
    }

    expect(sql).toMatch(/create trigger rate_limit_event_user_invitations_create[\s\S]*?'event_invitation_create'/i);
    expect(sql).toMatch(/create trigger rate_limit_event_user_invitations_respond[\s\S]*?'event_invitation_respond'/i);
    expect(sql).toMatch(/create trigger rate_limit_notifications\s+before update or delete on public\.notifications[\s\S]*?'profile_update'/i);
    expect(sql).toContain('drop policy if exists "Users can manage own notifications" on public.notifications;');
  });

  it("derives authenticated subjects and accepts only pre-HMACed public subjects", () => {
    const sql = migration();
    const authenticated = functionDefinition(sql, "consume_authenticated_rate_limit");
    const publicLimit = functionDefinition(sql, "consume_public_rate_limit");

    expect(authenticated).toContain("auth.uid()");
    expect(authenticated).toMatch(/if\s+current_user_id\s+is null then/i);
    expect(authenticated).toContain("private.consume_authenticated_rate_limit_once(operation)");
    expect(functionDefinition(sql, "try_consume_authenticated_rate_limit_once")).toMatch(
      /digest\(current_user_id::text,\s*'sha256'\)/i
    );
    expect(publicLimit).toMatch(/subject_hash bytea/i);
    expect(publicLimit).not.toMatch(/\b(token|cookie|ip|url)\b/i);

    expect(sql).toContain("grant execute on function public.consume_authenticated_rate_limit(text) to authenticated;");
    expect(sql).not.toContain("grant execute on function public.consume_authenticated_rate_limit(text) to service_role;");
    expect(sql).toContain("grant execute on function public.consume_public_rate_limit(text, bytea) to service_role;");
    expect(sql).not.toContain("grant execute on function public.consume_public_rate_limit(text, bytea) to authenticated;");
  });

  it("keeps generic audit service-only and accepts no actor id", () => {
    const sql = migration();
    const audit = functionDefinition(sql, "record_security_audit");
    const parameters = audit.match(
      /record_security_audit\(([\s\S]*?)\)\s*returns/i
    )?.[1];
    expect(parameters).not.toMatch(/actor_user_id\s+uuid/i);
    expect(audit).toContain("caller_role text := auth.role()");
    expect(audit).toMatch(/caller_role\s*<>\s*'service_role'/i);
    expect(audit).toContain("insert into private.security_audit_logs");
    expect(audit).toMatch(/outcome[^\n]+in \('success', 'denied'\)/i);
    expect(audit).toMatch(/operation[^\n]+(?:any|in)\s*\(/i);
    expect(audit).toMatch(/target_type[^\n]+(?:any|in)\s*\(/i);
    expect(sql).toContain("revoke all on function public.record_security_audit(text, text, uuid, text) from authenticated;");
    expect(sql).toContain("grant execute on function public.record_security_audit(text, text, uuid, text) to service_role;");
    expect(sql).not.toContain("grant execute on function public.record_security_audit(text, text, uuid, text) to authenticated;");
  });

  it("purges both private tables after 90 days and restricts purge to service role", () => {
    const sql = migration();
    const purge = functionDefinition(sql, "purge_expired_security_data");
    expect(purge).toContain("delete from private.rate_limit_buckets");
    expect(purge).toContain("delete from private.security_audit_logs");
    expect(purge.match(/interval '90 days'/g)).toHaveLength(2);
    expect(sql).toContain("grant execute on function public.purge_expired_security_data() to service_role;");
    expect(sql).not.toContain("grant execute on function public.purge_expired_security_data() to authenticated;");
  });

  it("hardens every public security RPC with an empty search path and explicit grants", () => {
    const sql = migration();
    for (const name of [
      "consume_authenticated_rate_limit",
      "consume_public_rate_limit",
      "record_security_audit",
      "purge_expired_security_data",
      "record_public_settlement_payment",
      "post_event_message",
      "create_event_user_invitations",
      "respond_event_user_invitation"
    ]) {
      const definition = functionDefinition(sql, name);
      expect(definition).toMatch(/security definer\s+set search_path = ''/i);
    }

    for (const signature of [
      "public.post_event_message(uuid, text)",
      "public.create_event_user_invitations(uuid, uuid[])",
      "public.respond_event_user_invitation(uuid, text)"
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(sql).not.toContain(`grant execute on function ${signature} to service_role;`);
    }
  });

  it("posts chat only for a joined member and audits the same atomic mutation", () => {
    const sql = migration();
    const definition = functionDefinition(sql, "post_event_message");
    expect(definition).toMatch(/char_length\(trim\(p_body\)\)[\s\S]*2000/i);
    expect(definition).toContain("private.is_joined_event_member(p_event_id)");
    expect(definition).toContain("status = 'cancelled'");
    expect(definition).toMatch(/private\.try_consume_authenticated_rate_limit_once\(\s*'event_message_post'/i);
    expect(definition).toContain("insert into public.event_messages");
    expect(definition).toContain("insert into private.security_audit_logs");
    expect(definition).toMatch(/'denied'[\s\S]*?return\s+'00000000-0000-0000-0000-000000000429'::uuid/i);
    expect(definition).toContain("returning id into");
  });

  it("creates bounded eligible invitations atomically with notifications and audit", () => {
    const sql = migration();
    const definition = functionDefinition(sql, "create_event_user_invitations");
    expect(definition).toMatch(/cardinality\(p_invitee_user_ids\)[\s\S]*between 1 and 20/i);
    expect(definition).toContain("private.is_event_owner(p_event_id)");
    expect(definition).toContain("private.have_shared_event");
    expect(definition).toContain("private.is_user_blocked");
    expect(definition).toContain("public.user_connections");
    expect(definition).toContain("public.user_favorites");
    expect(definition).toContain("public.event_members");
    expect(definition).toContain("public.event_user_invitations");
    expect(definition).toMatch(/private\.try_consume_authenticated_rate_limit_once\(\s*'event_invitation_create'/i);
    expect(definition).toContain("insert into public.notifications");
    expect(definition).toContain("insert into private.security_audit_logs");
    expect(definition).toMatch(/'denied'[\s\S]*?return\s+-429/i);
  });

  it("responds only to a pending invitee and keeps acceptance idempotent", () => {
    const sql = migration();
    const definition = functionDefinition(sql, "respond_event_user_invitation");
    expect(definition).toMatch(/p_response\s+not in \('accepted', 'declined'\)/i);
    expect(definition).toContain("invitee_user_id = current_user_id");
    expect(definition).toContain("status in ('pending', 'accepted')");
    expect(definition).toContain("private.is_user_blocked");
    expect(definition).toContain("private.have_shared_event");
    expect(definition).toMatch(/private\.try_consume_authenticated_rate_limit_once\(\s*'event_invitation_respond'/i);
    expect(definition).toContain("update public.event_user_invitations");
    expect(definition).toContain("insert into public.event_members");
    expect(definition).toContain("on conflict (event_id, user_id) do update");
    expect(definition).toContain("insert into private.security_audit_logs");
    expect(definition).toMatch(/'denied'[\s\S]*?return\s+'00000000-0000-0000-0000-000000000429'::uuid/i);
  });

  it("persists denied business-RPC audits without raising after the insert", () => {
    const sql = migration();
    for (const name of [
      "post_event_message",
      "create_event_user_invitations",
      "respond_event_user_invitation"
    ]) {
      const definition = functionDefinition(sql, name);
      expect(definition, name).toContain("'denied'");
      expect(definition, name).toMatch(/return\s+(?:-\d+|'[0-9a-f-]+'::uuid)/i);
      expect(definition, name).not.toMatch(/'denied'\s*\);[\s\S]{0,240}?raise exception/i);
    }
  });

  it("locks and records public settlement payment in one service-only RPC", () => {
    const sql = migration();
    const definition = functionDefinition(sql, "record_public_settlement_payment");
    expect(definition).toContain("auth.role() <> 'service_role'");
    expect(definition).toContain("public.share_links");
    expect(definition).toMatch(/from public\.settlements[\s\S]*?for update/i);
    expect(definition).toContain("public.settlement_payments");
    expect(definition).toMatch(/p_amount\s*>\s*settlement_amount\s*-\s*paid_amount/i);
    expect(definition).toContain("update public.settlements");
    expect(definition).toContain("update public.plans");
    expect(definition).toContain("insert into public.notifications");
    expect(definition).toContain("insert into private.security_audit_logs");

    const signature = "public.record_public_settlement_payment(uuid, uuid, integer, text, text, text)";
    expect(sql).toContain(`revoke all on function ${signature} from public;`);
    expect(sql).toContain(`revoke all on function ${signature} from anon;`);
    expect(sql).toContain(`revoke all on function ${signature} from authenticated;`);
    expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
  });

  it("returns calendar ciphertext only through an owner-bound service RPC", () => {
    const sql = migration();
    const definition = functionDefinition(sql, "get_event_calendar_integrations");
    expect(definition).toContain("p_owner_user_id uuid");
    expect(definition).toContain("auth.role() <> 'service_role'");
    expect(definition).toContain("public.events.owner_user_id = p_owner_user_id");
    expect(definition).toContain("public.calendar_integrations.encrypted_refresh_token");

    const signature = "public.get_event_calendar_integrations(uuid, uuid)";
    expect(sql).toContain(`revoke all on function ${signature} from authenticated;`);
    expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
    expect(sql).not.toContain("grant execute on function public.get_event_calendar_integrations(uuid, uuid) to authenticated;");
  });

  it("provides narrow session RPCs for admin-free authenticated paths", () => {
    const sql = migration();
    const contracts = new Map([
      ["get_plan_calendar_attendee_emails", ["owner_user_id = current_user_id", "public.calendar_integrations"]],
      ["join_event_from_invite", ["public.event_invite_links", "public.event_members"]],
      ["restart_plan_adjustment", ["private.is_event_owner", "public.availability_answers"]],
      ["record_settlement_payment", ["public.settlement_payments", "public.notifications"]],
      ["confirm_settlement_payment", ["public.settlement_payments", "private.security_audit_logs"]],
      ["get_settlement_page_data", ["public.participants", "jsonb_build_object"]]
    ]);

    for (const [name, requiredFragments] of contracts) {
      const definition = functionDefinition(sql, name);
      expect(definition).toMatch(/security definer\s+set search_path = ''/i);
      expect(definition).toContain("auth.uid()");
      for (const fragment of requiredFragments) {
        expect(definition, name).toContain(fragment);
      }
    }
  });
});
