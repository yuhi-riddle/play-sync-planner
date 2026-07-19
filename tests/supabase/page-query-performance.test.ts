import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/022_page_query_performance.sql");

function migration() {
  return readFileSync(migrationPath, "utf8");
}

function functionBody(sql: string, name: string) {
  const match = sql.match(
    new RegExp(
      `create or replace function\\s+public\\.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      "i"
    )
  );

  expect(match, `missing public.${name}`).not.toBeNull();
  return match![1];
}

function functionHeader(sql: string, name: string) {
  const match = sql.match(
    new RegExp(
      `(create or replace function\\s+public\\.${name}\\([\\s\\S]*?)\\s+as \\$\\$`,
      "i"
    )
  );

  expect(match, `missing public.${name}`).not.toBeNull();
  return match![1];
}

function hasHardenedDefinerSecurity(header: string) {
  return /\bsecurity definer\b/i.test(header) && /set search_path = ''/i.test(header);
}

describe("bounded page query RPC migration", () => {
  it("declares the five page RPCs with their fixed signatures and return columns", () => {
    const sql = migration();

    expect(sql).toMatch(
      /create or replace function\s+public\.get_connection_counts\(\)\s+returns table\s*\(\s*category text,\s*item_count bigint\s*\)/i
    );
    expect(sql).toMatch(
      /create or replace function\s+public\.list_connections\(\s*p_category text,\s*p_cursor_at timestamptz,\s*p_cursor_user_id uuid,\s*p_limit integer\s*\)\s+returns table\s*\(\s*user_id uuid,\s*display_name text,\s*shared_event_count bigint,\s*latest_shared_at timestamptz,\s*is_following boolean,\s*is_followed_by boolean,\s*is_favorite boolean,\s*cursor_at timestamptz,\s*cursor_user_id uuid\s*\)/i
    );
    expect(sql).toMatch(
      /create or replace function\s+public\.list_received_event_invitations\(\s*p_limit integer\s*\)\s+returns table\s*\(\s*invitation_id uuid,\s*event_id uuid,\s*event_title text,\s*organizer_name text,\s*created_at timestamptz\s*\)/i
    );
    expect(sql).toMatch(
      /create or replace function\s+public\.list_calendar_items\(\s*p_month date\s*\)\s+returns table\s*\(\s*candidate_id uuid,\s*plan_id uuid,\s*event_title text,\s*plan_title text,\s*start_at timestamptz,\s*end_at timestamptz,\s*is_all_day boolean,\s*status text,\s*yes_count bigint,\s*maybe_count bigint,\s*no_count bigint,\s*unanswered_count bigint\s*\)/i
    );
    expect(sql).toMatch(
      /create or replace function\s+public\.list_event_invite_candidates\(\s*p_event_id uuid,\s*p_query text,\s*p_cursor_at timestamptz,\s*p_cursor_user_id uuid,\s*p_limit integer\s*\)\s+returns table\s*\(\s*user_id uuid,\s*display_name text,\s*shared_event_count bigint,\s*latest_shared_at timestamptz,\s*is_following boolean,\s*is_followed_by boolean,\s*is_favorite boolean,\s*cursor_at timestamptz,\s*cursor_user_id uuid\s*\)/i
    );
  });

  it("bounds every paged list and uses a complete, descending keyset cursor", () => {
    const sql = migration();
    const connections = functionBody(sql, "list_connections");
    const invitations = functionBody(sql, "list_received_event_invitations");
    const candidates = functionBody(sql, "list_event_invite_candidates");
    const boundedLimit = /least\(greatest\(coalesce\(p_limit, 20\), 1\), 20\)/i;
    const keyset = /p_cursor_at is null\s+or p_cursor_user_id is null\s+or [\s\S]*?cursor_at < p_cursor_at\s+or \(.*?cursor_at = p_cursor_at\s+and .*?cursor_user_id < p_cursor_user_id\)/i;

    expect(connections).toMatch(boundedLimit);
    expect(invitations).toMatch(boundedLimit);
    expect(candidates).toMatch(boundedLimit);
    expect(connections).toMatch(keyset);
    expect(candidates).toMatch(keyset);
    expect(connections).toMatch(/order by\s+.*?cursor_at desc,\s+.*?cursor_user_id desc/i);
    expect(candidates).toMatch(/order by\s+.*?cursor_at desc,\s+.*?cursor_user_id desc/i);
    expect(invitations).toMatch(/order by\s+.*?created_at desc,\s+.*?id desc/i);
  });

  it("keeps connection categories allowlisted and shares the same classification rules for counts and rows", () => {
    const sql = migration();
    const counts = functionBody(sql, "get_connection_counts");
    const connections = functionBody(sql, "list_connections");

    expect(connections).toMatch(
      /p_category is null\s+or p_category not in \('favorites', 'mutual', 'following', 'shared', 'blocked'\)/i
    );

    for (const body of [counts, connections]) {
      expect(body).toContain("visible_shared_memberships as");
      expect(body).toContain("when relation_state.is_favorite then 'favorites'");
      expect(body).toContain("when relation_state.is_following and relation_state.is_followed_by then 'mutual'");
      expect(body).toContain("when relation_state.is_following then 'following'");
      expect(body).toContain("else 'shared'");
      expect(body).toContain("'blocked'::text as category");
      expect(body).toContain("public.user_blocks");
    }
  });

  it("requires the caller to own an event before exposing invite candidates", () => {
    const sql = migration();
    const candidates = functionBody(sql, "list_event_invite_candidates");

    expect(candidates).toMatch(
      /if not exists \(\s*select 1\s*from public\.events\s*where public\.events\.id = p_event_id\s*and public\.events\.owner_user_id = v_actor\s*\) then\s*raise exception 'Event owner required';\s*end if;/i
    );
    expect(candidates).toContain("public.user_connections");
    expect(candidates).toContain("public.user_favorites");
    expect(candidates).toContain("candidate_member.status = 'joined'");
    expect(candidates).toContain("blocker_user_id = v_actor");
    expect(candidates).toContain("blocked_user_id = v_actor");
  });

  it("keeps calendar data within a normalized month grid and aggregates answer states", () => {
    const sql = migration();
    const calendar = functionBody(sql, "list_calendar_items");

    expect(calendar).toContain("date_trunc('month', p_month)::date");
    expect(calendar).toContain("v_month_start - 6");
    expect(calendar).toContain("candidate.start_at < v_range_end");
    expect(calendar).toContain("coalesce(candidate.end_at, candidate.start_at) >= v_range_start");
    expect(calendar).toContain("count(answer.id) filter (where answer.answer = 'yes')");
    expect(calendar).toContain("count(answer.id) filter (where answer.answer = 'maybe')");
    expect(calendar).toContain("count(answer.id) filter (where answer.answer = 'no')");
    expect(calendar).toContain("count(answer.id) filter (where answer.answer = 'unanswered')");
  });

  it("uses an exclusive calendar upper bound that includes the six following days", () => {
    const calendar = functionBody(migration(), "list_calendar_items");

    expect(calendar).toMatch(
      /v_range_end := \(\(v_month_start \+ interval '1 month'\)::date \+ 7\)::timestamp at time zone 'Asia\/Tokyo';\s*[\s\S]*?candidate\.start_at < v_range_end/i
    );
  });

  it("resolves invitation organizer names from nickname, then the latest membership name, then the default", () => {
    const invitations = functionBody(migration(), "list_received_event_invitations");

    expect(invitations).toContain(
      "coalesce(nullif(btrim(organizer_profile.nickname), ''), nullif(btrim(organizer_member_name.display_name), ''), 'Madoiユーザー') as organizer_name"
    );
    expect(invitations).toMatch(
      /left join lateral \(\s*select organizer_member\.display_name\s*from public\.event_members as organizer_member\s*where organizer_member\.user_id = invitation\.inviter_user_id\s*order by organizer_member\.created_at desc,\s*organizer_member\.event_id desc\s*limit 1\s*\) as organizer_member_name on true/i
    );
    expect(invitations).not.toContain("organizer_member.event_id = invitation.event_id");
    expect(invitations).not.toContain("organizer_member.status = 'joined'");
  });

  it("does not let a later function header satisfy an earlier function's security check", () => {
    const sql = `
      create or replace function public.first()
      returns void
      language plpgsql
      stable
      as $$
      create or replace function public.second()
      returns void
      language plpgsql
      stable
      security definer
      set search_path = ''
      as $$
    `;

    expect(hasHardenedDefinerSecurity(functionHeader(sql, "first"))).toBe(false);
    expect(hasHardenedDefinerSecurity(functionHeader(sql, "second"))).toBe(true);
  });

  it("uses hardened definer functions with caller checks, safe grants, name fallbacks, and the message index", () => {
    const sql = migration();
    const signatures = [
      "public.get_connection_counts()",
      "public.list_connections(text, timestamptz, uuid, integer)",
      "public.list_received_event_invitations(integer)",
      "public.list_calendar_items(date)",
      "public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer)"
    ];
    const functionNames = [
      "get_connection_counts",
      "list_connections",
      "list_received_event_invitations",
      "list_calendar_items",
      "list_event_invite_candidates"
    ];

    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    for (const name of functionNames) {
      const body = functionBody(sql, name);
      const header = functionHeader(sql, name);
      expect(header).toMatch(/\bsecurity definer\b/i);
      expect(header).toMatch(/set search_path = ''/i);
      expect(body).toContain("auth.uid()");
      expect(body).toMatch(/if v_actor is null then\s+raise exception 'Authentication required';\s+end if;/i);
    }

    for (const signature of signatures) {
      expect(sql).toContain(`revoke all on function ${signature} from public;`);
      expect(sql).toContain(`revoke all on function ${signature} from anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role;`);
    }

    expect(sql).toContain("coalesce(nullif(btrim(profile.nickname), ''), nullif(btrim(member_name.display_name), ''), 'Madoiユーザー')");
    expect(sql).toContain("create index if not exists event_messages_event_id_created_at_id_idx");
    expect(sql).toMatch(
      /on public\.event_messages\(event_id, created_at desc, id desc\)/i
    );
  });
});
