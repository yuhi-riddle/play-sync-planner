import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/036_event_chat_rate_limit.sql");

describe("event chat rate limit migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("rate limits post_event_message per authenticated user before doing anything else", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.post_event_message(");
    expect(sql).toContain(
      "retry_seconds := private.try_consume_authenticated_rate_limit_once('event_message_post')"
    );
    expect(sql).toContain("return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds)");
  });

  it("returns a jsonb result instead of raising, so denied attempts still get audited", () => {
    const sql = migration();

    expect(sql).toContain("returns jsonb");
    expect(sql.match(/insert into private\.security_audit_logs/g)?.length).toBe(6);
    expect(sql).toContain("'event_message_post', 'message', created_message_id, 'success'");
  });

  it("validates the body length and joined-membership the same way the app currently does", () => {
    const sql = migration();

    expect(sql).toContain("char_length(trim(p_body)) = 0 or char_length(p_body) > 2000");
    expect(sql).toContain("public.is_joined_event_member(p_event_id)");
    expect(sql).toContain("event_status = 'cancelled'");
  });

  it("builds the same notification title/body/href/dedupe_key as the current TypeScript implementation", () => {
    const sql = migration();

    expect(sql).toContain("'event_message'");
    expect(sql).toContain("event_title || ' に新しいメッセージがあります'");
    expect(sql).toContain("'イベント参加者から新しいメッセージがあります。'");
    expect(sql).toContain("'/events/' || p_event_id::text || '#chat'");
    expect(sql).toContain("'event-message:' || p_event_id::text || ':' || public.event_members.user_id::text");
  });

  it("limits execution to authenticated, never anon", () => {
    const sql = migration();

    expect(sql).toContain("revoke all on function public.post_event_message(uuid, text) from public, anon");
    expect(sql).toContain("grant execute on function public.post_event_message(uuid, text) to authenticated");
  });

  it("does not fail the whole post when only the notification insert fails, matching the old TS behavior", () => {
    const sql = migration();

    const notificationInsertIndex = sql.indexOf("insert into public.notifications");
    const exceptionBlockIndex = sql.indexOf("exception\n    when others then\n      null;\n  end;");
    const messageInsertIndex = sql.indexOf("insert into public.event_messages");

    expect(messageInsertIndex).toBeGreaterThan(-1);
    expect(notificationInsertIndex).toBeGreaterThan(messageInsertIndex);
    expect(exceptionBlockIndex).toBeGreaterThan(notificationInsertIndex);
  });
});
