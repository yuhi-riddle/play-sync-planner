import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/017_connections_messages_and_invites.sql"
);

describe("connections, invitations, and messages schema migration", () => {
  it("creates the connection, block, favorite, invitation, and message tables", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table public.user_connections");
    expect(migration).toContain("create table public.user_blocks");
    expect(migration).toContain("create table public.user_favorites");
    expect(migration).toContain("create table public.event_user_invitations");
    expect(migration).toContain("create table public.event_messages");
    expect(migration).toContain("check (follower_user_id <> followed_user_id)");
    expect(migration).toContain("check (blocker_user_id <> blocked_user_id)");
    expect(migration).toContain("check (user_id <> favorite_user_id)");
    expect(migration).toContain("check (char_length(trim(body)) > 0 and char_length(body) <= 2000)");
  });

  it("uses security-definer helpers for RLS checks against existing event tables", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.have_shared_event(");
    expect(migration).toContain("create or replace function public.is_user_blocked(");
    expect(migration).toContain("create or replace function public.is_event_member(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("using (public.is_event_owner(event_id))");
    expect(migration).toContain("using (public.is_event_member(event_id))");
  });

  it("limits relation access, invitations, and messages to the intended users", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("alter table public.user_connections enable row level security");
    expect(migration).toContain("alter table public.user_blocks enable row level security");
    expect(migration).toContain("alter table public.user_favorites enable row level security");
    expect(migration).toContain("alter table public.event_user_invitations enable row level security");
    expect(migration).toContain("alter table public.event_messages enable row level security");
    expect(migration).toContain("follower_user_id = auth.uid()");
    expect(migration).toContain("followed_user_id = auth.uid()");
    expect(migration).toContain("blocker_user_id = auth.uid()");
    expect(migration).toContain("user_id = auth.uid()");
    expect(migration).toContain("invitee_user_id = auth.uid()");
    expect(migration).toContain("status in ('pending', 'accepted', 'declined', 'revoked')");
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toContain("public.have_shared_event(inviter_user_id, invitee_user_id)");
    expect(migration).toContain("not public.is_user_blocked(inviter_user_id, invitee_user_id)");
    expect(migration).toContain("create trigger event_user_invitations_protect_update");
  });

  it("indexes connection and event query paths and preserves notification kinds", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create index user_connections_followed_user_id_idx");
    expect(migration).toContain("create index user_blocks_blocked_user_id_idx");
    expect(migration).toContain("create index user_favorites_favorite_user_id_idx");
    expect(migration).toContain("create index event_user_invitations_event_id_idx");
    expect(migration).toContain("create index event_messages_event_id_created_at_idx");
    expect(migration).toContain("drop constraint if exists notifications_kind_check");
    expect(migration).toContain("'answer_received'");
    expect(migration).toContain("'answer_deadline'");
    expect(migration).toContain("'unanswered'");
    expect(migration).toContain("'settlement_needed'");
    expect(migration).toContain("'payment_due'");
    expect(migration).toContain("'confirmation_due'");
    expect(migration).toContain("'event_invitation'");
    expect(migration).toContain("'event_message'");
  });
});
