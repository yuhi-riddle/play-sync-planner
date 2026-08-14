import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/034_connection_calendar_rpc.sql");

describe("connection, invitation, and calendar RPC migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8");

  it("adds the query-path indexes for connections, invitations, and the calendar", () => {
    const sql = migration();

    expect(sql).toContain("create index if not exists event_messages_event_id_created_at_id_idx");
    expect(sql).toContain("create index if not exists event_members_user_status_created_event_idx");
    expect(sql).toContain("create index if not exists event_members_event_status_user_created_idx");
    expect(sql).toContain("create index if not exists user_connections_followed_follower_idx");
    expect(sql).toContain("create index if not exists user_blocks_blocker_created_blocked_idx");
    expect(sql).toContain("create index if not exists event_user_invitations_invitee_status_created_id_idx");
    expect(sql).toContain("create index if not exists candidate_dates_plan_start_end_idx");
  });

  it("classifies connections into favorites/mutual/following/shared/blocked while excluding blocked pairs", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.get_connection_counts()");
    expect(sql).toContain("returns table(category text, item_count bigint)");
    expect(sql).toContain("create or replace function public.list_connections(");
    expect(sql).toContain(
      "returns table(\n  user_id uuid,\n  display_name text,\n  shared_event_count bigint,\n  latest_shared_at timestamptz,\n  is_following boolean,\n  is_followed_by boolean,\n  is_favorite boolean,\n  cursor_at timestamptz,\n  cursor_user_id uuid\n)"
    );
    expect(sql).toContain("when relation_state.is_favorite then 'favorites'");
    expect(sql).toContain("when relation_state.is_following and relation_state.is_followed_by then 'mutual'");
    expect(sql).toContain("'blocked'::text as category");
    expect(sql).toContain("v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20)");
  });

  it("scopes list_calendar_items to the requested month with a 6-day/7-day buffer in Asia/Tokyo", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.list_calendar_items(");
    expect(sql).toContain("v_range_start := (v_month_start - 6)::timestamp at time zone 'Asia/Tokyo'");
    expect(sql).toContain("v_range_end := ((v_month_start + interval '1 month')::date + 7)::timestamp at time zone 'Asia/Tokyo'");
    expect(sql).toContain("and plan.status in ('draft', 'collecting_answers')");
    expect(sql).toContain("count(answer.id) filter (where answer.answer = 'yes') as yes_count");
  });

  it("returns date_confirmed plans once via plan.confirmed_start_at instead of once per surviving candidate_date", () => {
    const sql = migration();

    expect(sql).toContain("null::uuid as candidate_id");
    expect(sql).toContain("plan.confirmed_start_at as start_at");
    expect(sql).toContain("plan.confirmed_end_at as end_at");
    expect(sql).toContain("and plan.status = 'date_confirmed'");
    expect(sql).toContain("and plan.confirmed_start_at is not null");
  });

  it("restricts list_event_invite_candidates to the event owner and excludes joined members and blocked pairs", () => {
    const sql = migration();

    expect(sql).toContain("create or replace function public.list_event_invite_candidates(");
    expect(sql).toMatch(
      /if not exists \(\s+select 1\s+from public\.events\s+where public\.events\.id = p_event_id\s+and public\.events\.owner_user_id = v_actor\s+\) then\s+raise exception 'Event owner required';/
    );
    expect(sql).toContain("and candidate_member.status = 'joined'");
    expect(sql).toContain("enriched_candidates.display_name ilike '%' || v_query || '%'");
  });

  it("requires authentication in every RPC and limits execution to authenticated/service_role", () => {
    const sql = migration();

    expect(sql.match(/raise exception 'Authentication required';/g)).toHaveLength(5);
    expect(sql).toContain("revoke all on function public.get_connection_counts() from anon");
    expect(sql).toContain("grant execute on function public.get_connection_counts() to authenticated");
    expect(sql).toContain(
      "revoke all on function public.list_connections(text, timestamptz, uuid, integer) from anon"
    );
    expect(sql).toContain(
      "revoke all on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) from anon"
    );
  });

  it("lets joined event members view fellow members and the event's plans via existing helpers", () => {
    const sql = migration();

    expect(sql).toContain('create policy "Joined members can view event members"');
    expect(sql).toContain('create policy "Joined members can view plans"');
    expect(sql).toContain("public.is_event_owner(event_id)\n  or public.is_joined_event_member(event_id)");
  });
});
