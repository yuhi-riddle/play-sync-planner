import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/037_event_invitation_rate_limit.sql");

describe("event invitation rate limit migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

  it("rate limits invitation creation and response separately, per authenticated user", () => {
    const sql = migration();

    expect(sql).toContain(
      "retry_seconds := private.try_consume_authenticated_rate_limit_once('event_invitation_create')"
    );
    expect(sql).toContain(
      "retry_seconds := private.try_consume_authenticated_rate_limit_once('event_invitation_respond')"
    );
  });

  it("returns jsonb with distinct error codes instead of the 023 magic-integer scheme", () => {
    const sql = migration();

    expect(sql).toContain("returns jsonb");
    for (const errorCode of [
      "invalid_input",
      "empty_selection",
      "self_invite",
      "not_owner",
      "blocked",
      "not_eligible",
      "already_member",
      "already_invited"
    ]) {
      expect(sql).toContain(`'error', '${errorCode}'`);
    }
    expect(sql).not.toContain("00000000-0000-0000-0000-000000000429");
    expect(sql).not.toContain("return -429");
  });

  it("uses public. helpers, not private., since main hasn't moved these behind the private schema", () => {
    const sql = migration();

    expect(sql).toContain("public.is_event_owner(p_event_id)");
    expect(sql).toContain("public.is_user_blocked(current_user_id, invitee_user_id)");
    expect(sql).toContain("public.have_shared_event(current_user_id, invitee_user_id)");
  });

  it("treats accepting an already-accepted invitation as idempotent success, matching the current TS behavior", () => {
    const sql = migration();

    expect(sql).toContain("if invitation_record.status = 'accepted' and p_response = 'accepted' then");
    expect(sql).toContain("return jsonb_build_object('ok', true, 'event_id', invitation_record.event_id);");
  });

  it("resolves the joining member's display name the same way getUserDisplayName() does, not profiles-first", () => {
    const sql = migration();

    expect(sql).toContain("auth.users.raw_user_meta_data ->> 'nickname'");
    expect(sql).toContain("auth.users.raw_user_meta_data ->> 'full_name'");
    expect(sql).toContain("auth.users.raw_user_meta_data ->> 'name'");
    expect(sql).not.toContain("left join public.profiles");
  });

  it("distinguishes blocked from no-shared-event on respond, matching the two separate existing TS messages", () => {
    const sql = migration();

    expect(sql).toContain("if public.is_user_blocked(invitation_record.inviter_user_id, current_user_id) then");
    expect(sql).toContain("if not public.have_shared_event(invitation_record.inviter_user_id, current_user_id) then");
    expect(sql).toContain("'error', 'blocked'");
    expect(sql).toContain("'error', 'not_shared_event'");
  });

  it("limits execution to authenticated, never anon, for both RPCs", () => {
    const sql = migration();

    expect(sql).toContain("revoke all on function public.create_event_user_invitations(uuid, uuid[]) from public, anon");
    expect(sql).toContain("grant execute on function public.create_event_user_invitations(uuid, uuid[]) to authenticated");
    expect(sql).toContain("revoke all on function public.respond_event_user_invitation(uuid, text) from public, anon");
    expect(sql).toContain("grant execute on function public.respond_event_user_invitation(uuid, text) to authenticated");
  });

  it("checks event ownership before validating the invitee list, so a non-owner always gets not_owner first", () => {
    const sql = migration();

    const notOwnerIndex = sql.indexOf("if not public.is_event_owner(p_event_id) then");
    const invalidInputIndex = sql.indexOf("if cardinality(p_invitee_user_ids) not between 1 and 20 then");
    const selfInviteIndex = sql.indexOf("if current_user_id = any(normalized_invitee_user_ids) then");

    expect(notOwnerIndex).toBeGreaterThan(-1);
    expect(invalidInputIndex).toBeGreaterThan(-1);
    expect(selfInviteIndex).toBeGreaterThan(-1);
    expect(notOwnerIndex).toBeLessThan(invalidInputIndex);
    expect(notOwnerIndex).toBeLessThan(selfInviteIndex);
  });

  it("looks up the invitation regardless of status, so a declined/revoked invitation reports already_responded instead of not_found", () => {
    const sql = migration();

    expect(sql).not.toMatch(
      /where public\.event_user_invitations\.id = p_invitation_id\s+and public\.event_user_invitations\.invitee_user_id = current_user_id\s+and public\.event_user_invitations\.status in \('pending', 'accepted'\)/
    );
    expect(sql).toMatch(
      /where public\.event_user_invitations\.id = p_invitation_id\s+and public\.event_user_invitations\.invitee_user_id = current_user_id\s+for update;/
    );
  });
});
