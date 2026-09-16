# つながり画面「進行中の共通イベント」表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** つながり画面の人物行から、その相手と自分が今も一緒に参加している「進行中」の共通イベント一覧をモーダルで見られるようにする。

**Architecture:** 新規migration（`event_activity_state`ビュー＋`list_active_shared_events`RPC＋`list_connections`への列追加）→ ドメイン層のマッピング拡張 → 新規Server Action → 新規モーダルコンポーネント → `ConnectionRow`への配線、の順に積む。

**Tech Stack:** Next.js 15 App Router、Supabase (Postgres/plpgsql)、TypeScript、Vitest + Testing Library、`pg`直結のDBテスト。

## Global Constraints

- DBスキーマ変更（新規ビュー・新規RPC・既存RPCの戻り値列追加）を含む。**このmigrationは実装後、ユーザーが内容を確認してから本番へ適用する**（既存の運用ルール、CLAUDE.mdの「設定ファイル・DBスキーマは明示的な許可なしに変更しない」）
- 「進行中」の判定は既存の`list_owned_event_ids`（`supabase/migrations/048_event_list_soonest_sort_order.sql`）の`lifecycle_finished`/`settlement_state`計算と完全に同じロジックを使う。`list_owned_event_ids`自体は変更しない
- ブロック中タブの人物行には「進行中◯件」を出さない
- 「共通」＝自分と相手の両方が`event_members.status='joined'`で現在も参加中のイベントのみ
- テスト・型チェック・lintの実行は常にこちらで行う
- 各タスクの最後に対象テストを実行してGREENを確認してからコミットする

---

## Task 1: migration — `event_activity_state`ビュー・`list_active_shared_events`RPC・`list_connections`拡張

**Files:**
- Create: `supabase/migrations/050_connection_active_shared_events.sql`
- Test: `tests/account/schema/connection-active-shared-events-schema.test.ts`

**Interfaces:**
- Produces: ビュー`public.event_activity_state(event_id uuid, status text, lifecycle_finished boolean, settlement_state text, is_active boolean, display_state text)`。RPC`public.list_active_shared_events(p_other_user_id uuid) returns table(event_id uuid, title text, display_state text)`。`public.list_connections(...)`の戻り値に`active_shared_event_count bigint`列が追加される（列の並びは既存9列の直後）

- [ ] **Step 1: migrationファイルを書く**

`supabase/migrations/050_connection_active_shared_events.sql`:

```sql
-- つながり画面の人物行に「進行中の共通イベント」を出すための基盤。
--
-- 「進行中」の判定は list_owned_event_ids（048）の lifecycle_finished /
-- settlement_state の計算と完全に同じにする。list_owned_event_ids 自体は
-- owner_user_id 起点のクエリなので、ここでは全イベント向けに計算する
-- ビューとして切り出す（list_connections と list_active_shared_events の
-- 2箇所から使うため、DRYにする）。

begin;

create or replace view public.event_activity_state as
with plan_state as (
  select
    p.event_id,
    count(*) as plan_count,
    bool_or(p.status not in ('cancelled', 'skipped')) as has_relevant_plan,
    bool_or(
      p.status not in ('cancelled', 'skipped')
      and (
        coalesce(p.confirmed_end_at, p.confirmed_start_at) is null
        or coalesce(p.confirmed_end_at, p.confirmed_start_at) >= now()
      )
    ) as has_unfinished_relevant_plan,
    bool_or(p.settlement_status = 'settling') as has_settling,
    bool_or(p.settlement_status = 'needed') as has_needed,
    bool_or(p.settlement_status = 'not_started') as has_not_started,
    bool_or(p.settlement_status = 'settled') as has_settled,
    bool_or(p.status = 'collecting_answers') as has_collecting_answers,
    bool_or(
      p.status not in ('cancelled', 'skipped')
      and p.confirmed_start_at is not null
      and p.confirmed_start_at > now()
    ) as has_upcoming_confirmed
  from public.plans as p
  group by p.event_id
),
event_state as (
  select
    e.id as event_id,
    e.status,
    coalesce(ps.has_collecting_answers, false) as has_collecting_answers,
    coalesce(ps.has_upcoming_confirmed, false) as has_upcoming_confirmed,
    case
      when e.status in ('done', 'cancelled', 'skipped') then true
      when coalesce(ps.has_relevant_plan, false) then not coalesce(ps.has_unfinished_relevant_plan, false)
      when coalesce(e.end_date, e.start_date) is null then false
      else (
        (coalesce(e.end_date, e.start_date) + 1)::timestamp at time zone 'Asia/Tokyo'
      ) <= now()
    end as lifecycle_finished,
    case
      when coalesce(ps.plan_count, 0) = 0 then 'not_needed'
      when coalesce(ps.has_settling, false) then 'settling'
      when coalesce(ps.has_needed, false) then 'needed'
      when e.status <> 'cancelled' and coalesce(ps.has_not_started, false) then 'not_started'
      when coalesce(ps.has_settled, false) then 'settled'
      else 'not_needed'
    end as settlement_state
  from public.events as e
  left join plan_state as ps on ps.event_id = e.id
)
select
  event_state.event_id,
  event_state.status,
  event_state.lifecycle_finished,
  event_state.settlement_state,
  (not event_state.lifecycle_finished or event_state.settlement_state not in ('not_needed', 'settled')) as is_active,
  case
    when event_state.lifecycle_finished and event_state.settlement_state not in ('not_needed', 'settled')
      then 'settlement_waiting'
    when event_state.status = 'cancelled' then 'cancelled'
    when event_state.lifecycle_finished then 'completed'
    when event_state.has_collecting_answers then 'answer_waiting'
    when event_state.has_upcoming_confirmed then 'event_waiting'
    when event_state.status = 'interested' then 'participant_waiting'
    else 'schedule_creation_waiting'
  end as display_state
from event_state;

-- ---------------------------------------------------------------------------
-- 自分と相手の両方が現在も joined な、進行中の共通イベント一覧
-- ---------------------------------------------------------------------------

create or replace function public.list_active_shared_events(
  p_other_user_id uuid
)
returns table(
  event_id uuid,
  title text,
  display_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_other_user_id is null then
    raise exception 'p_other_user_id is required';
  end if;

  if exists (
    select 1
    from public.user_blocks as relationship_block
    where (
      relationship_block.blocker_user_id = v_actor
      and relationship_block.blocked_user_id = p_other_user_id
    )
    or (
      relationship_block.blocker_user_id = p_other_user_id
      and relationship_block.blocked_user_id = v_actor
    )
  ) then
    return;
  end if;

  return query
  select
    e.id as event_id,
    e.title,
    activity.display_state
  from public.event_members as my_membership
  join public.event_members as their_membership
    on their_membership.event_id = my_membership.event_id
    and their_membership.status = 'joined'
    and their_membership.user_id = p_other_user_id
  join public.events as e
    on e.id = my_membership.event_id
  join public.event_activity_state as activity
    on activity.event_id = e.id
  where my_membership.user_id = v_actor
    and my_membership.status = 'joined'
    and activity.is_active
  order by e.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_connections に active_shared_event_count を追加（戻り値の列が増えるので
-- create or replace ではなく drop してから作り直す）
-- ---------------------------------------------------------------------------

drop function if exists public.list_connections(text, timestamptz, uuid, integer);

create or replace function public.list_connections(
  p_category text,
  p_cursor_at timestamptz,
  p_cursor_user_id uuid,
  p_limit integer
)
returns table(
  user_id uuid,
  display_name text,
  shared_event_count bigint,
  active_shared_event_count bigint,
  latest_shared_at timestamptz,
  is_following boolean,
  is_followed_by boolean,
  is_favorite boolean,
  cursor_at timestamptz,
  cursor_user_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_category is null
    or p_category not in ('favorites', 'mutual', 'following', 'shared', 'blocked') then
    raise exception 'Invalid connection category';
  end if;

  return query
  with shared_memberships as (
    select
      other_member.user_id,
      count(*)::bigint as shared_event_count,
      count(*) filter (where activity.is_active)::bigint as active_shared_event_count,
      max(other_member.created_at) as latest_shared_at
    from public.event_members as current_member
    join public.event_members as other_member
      on other_member.event_id = current_member.event_id
      and other_member.status = 'joined'
    join public.event_activity_state as activity
      on activity.event_id = current_member.event_id
    where current_member.user_id = v_actor
      and current_member.status = 'joined'
      and other_member.user_id <> v_actor
    group by other_member.user_id
  ),
  visible_shared_memberships as (
    select shared_memberships.*
    from shared_memberships
    where not exists (
      select 1
      from public.user_blocks as relationship_block
      where (
        relationship_block.blocker_user_id = v_actor
        and relationship_block.blocked_user_id = shared_memberships.user_id
      )
      or (
        relationship_block.blocker_user_id = shared_memberships.user_id
        and relationship_block.blocked_user_id = v_actor
      )
    )
  ),
  relation_state as (
    select
      visible_shared_memberships.user_id,
      visible_shared_memberships.shared_event_count,
      visible_shared_memberships.active_shared_event_count,
      visible_shared_memberships.latest_shared_at,
      following.follower_user_id is not null as is_following,
      followed_by.follower_user_id is not null as is_followed_by,
      favorite.user_id is not null as is_favorite
    from visible_shared_memberships
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = visible_shared_memberships.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = visible_shared_memberships.user_id
      and followed_by.followed_user_id = v_actor
    left join public.user_favorites as favorite
      on favorite.user_id = v_actor
      and favorite.favorite_user_id = visible_shared_memberships.user_id
  ),
  classified_connections as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.active_shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
      relation_state.is_favorite,
      relation_state.latest_shared_at as cursor_at,
      relation_state.user_id as cursor_user_id,
      case
        when relation_state.is_favorite then 'favorites'
        when relation_state.is_following and relation_state.is_followed_by then 'mutual'
        when relation_state.is_following then 'following'
        else 'shared'
      end as category
    from relation_state

    union all

    select
      blocked_user.blocked_user_id as user_id,
      coalesce(shared_memberships.shared_event_count, 0::bigint) as shared_event_count,
      coalesce(shared_memberships.active_shared_event_count, 0::bigint) as active_shared_event_count,
      shared_memberships.latest_shared_at,
      false as is_following,
      false as is_followed_by,
      false as is_favorite,
      blocked_user.created_at as cursor_at,
      blocked_user.blocked_user_id as cursor_user_id,
      'blocked'::text as category
    from public.user_blocks as blocked_user
    left join shared_memberships
      on shared_memberships.user_id = blocked_user.blocked_user_id
    where blocked_user.blocker_user_id = v_actor
  ),
  enriched_connections as (
    select
      classified_connections.user_id,
      coalesce(nullif(btrim(profile.nickname), ''), nullif(btrim(member_name.display_name), ''), 'Madoiユーザー') as display_name,
      classified_connections.shared_event_count,
      classified_connections.active_shared_event_count,
      classified_connections.latest_shared_at,
      classified_connections.is_following,
      classified_connections.is_followed_by,
      classified_connections.is_favorite,
      classified_connections.cursor_at,
      classified_connections.cursor_user_id
    from classified_connections
    left join public.profiles as profile
      on profile.user_id = classified_connections.user_id
    left join lateral (
      select event_member.display_name
      from public.event_members as event_member
      where event_member.user_id = classified_connections.user_id
      order by event_member.created_at desc, event_member.event_id desc
      limit 1
    ) as member_name on true
    where classified_connections.category = p_category
  )
  select
    enriched_connections.user_id,
    enriched_connections.display_name,
    enriched_connections.shared_event_count,
    enriched_connections.active_shared_event_count,
    enriched_connections.latest_shared_at,
    enriched_connections.is_following,
    enriched_connections.is_followed_by,
    enriched_connections.is_favorite,
    enriched_connections.cursor_at,
    enriched_connections.cursor_user_id
  from enriched_connections
  where (
    p_cursor_at is null
    or p_cursor_user_id is null
    or enriched_connections.cursor_at < p_cursor_at
    or (enriched_connections.cursor_at = p_cursor_at and enriched_connections.cursor_user_id < p_cursor_user_id)
  )
  order by enriched_connections.cursor_at desc, enriched_connections.cursor_user_id desc
  limit v_limit;
end;
$$;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.list_connections(text, timestamptz, uuid, integer);
-- （その後、034時点の list_connections 定義を再適用する）
-- drop function if exists public.list_active_shared_events(uuid);
-- drop view if exists public.event_activity_state;
```

- [ ] **Step 2: スキーマテストを書く**

`tests/account/schema/connection-active-shared-events-schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/050_connection_active_shared_events.sql"
);

describe("connection active shared events migration", () => {
  it("creates the event_activity_state view with is_active and display_state", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace view public.event_activity_state");
    expect(migration).toContain("as is_active");
    expect(migration).toContain("as display_state");
    expect(migration).toContain("'settlement_waiting'");
    expect(migration).toContain("'schedule_creation_waiting'");
  });

  it("creates list_active_shared_events with a block check", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.list_active_shared_events(");
    expect(migration).toContain("p_other_user_id uuid");
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public.user_blocks as relationship_block");
    expect(migration).toContain("and activity.is_active");
  });

  it("drops and recreates list_connections with active_shared_event_count", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("drop function if exists public.list_connections(text, timestamptz, uuid, integer);");
    expect(migration).toContain("active_shared_event_count bigint");
    expect(migration).toContain("count(*) filter (where activity.is_active)::bigint as active_shared_event_count");
  });
});
```

- [ ] **Step 3: テストを実行して通ることを確認**

Run: `npx vitest run --reporter=dot tests/account/schema/connection-active-shared-events-schema.test.ts`
Expected: PASS（3件）

- [ ] **Step 4: コミット**

```bash
git.exe add supabase/migrations/050_connection_active_shared_events.sql tests/account/schema/connection-active-shared-events-schema.test.ts
git.exe commit -m "feat(connections): 進行中の共通イベント用のビュー・RPCを追加

event_activity_state ビュー（list_owned_event_ids と同じ lifecycle_finished/
settlement_state 計算）と list_active_shared_events RPC を新規追加。
list_connections に active_shared_event_count 列を追加（列追加のため
drop してから作り直し）。"
```

（この時点ではmigrationはまだ本番に適用しない。Task 2のDBテストで動作確認したあと、ユーザーの確認を経て適用する）

---

## Task 2: DBテスト — `list_active_shared_events` / `list_connections`の新しい列

**Files:**
- Test: `tests/db/connection-active-shared-events.test.ts`

**Interfaces:**
- Consumes: Task 1で作った`event_activity_state`ビュー、`list_active_shared_events`RPC、`list_connections`RPC

- [ ] **Step 1: 失敗するテストを書く**

`tests/db/connection-active-shared-events.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

async function makeUser() {
  const userId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1,$2)", [userId, `${userId}@e.test`]);
  return userId;
}

async function makeEvent(
  ownerId: string,
  title: string,
  options: { status?: string; endDate?: string } = {}
) {
  const eventId = randomUUID();
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,$3,$4,$5,$5)",
    [eventId, ownerId, title, options.status ?? "confirmed", options.endDate ?? "2099-01-01"]
  );
  return eventId;
}

async function joinEvent(eventId: string, userId: string, status = "joined") {
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'メンバー','member',$3)",
    [eventId, userId, status]
  );
}

async function asUser(userId: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("begin");
});
afterEach(async () => {
  await client.query("rollback");
});

describe("list_active_shared_events", () => {
  it("自分と相手が両方joinedな進行中イベントだけ返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "進行中の会", { status: "confirmed", endDate: "2099-01-01" });
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);

    await asUser(me);
    const { rows } = await client.query(
      "select event_id, title, display_state from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_id: eventId, title: "進行中の会" });
  });

  it("相手が抜けたイベントは含めない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "抜けた会");
    await joinEvent(eventId, me);
    await joinEvent(eventId, other, "removed");

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });

  it("開催済み・清算不要のイベントは含めない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "終わった会", { status: "done", endDate: "2020-01-01" });
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });

  it("ブロック関係があれば空を返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "ブロック済みとの会");
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);
    await client.query(
      "insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)",
      [me, other]
    );

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });
});

describe("list_connections の active_shared_event_count", () => {
  it("進行中の共通イベントだけを数える（開催済みは含めない）", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const activeEventId = await makeEvent(me, "進行中の会", { status: "confirmed", endDate: "2099-01-01" });
    const doneEventId = await makeEvent(me, "終わった会", { status: "done", endDate: "2020-01-01" });
    await joinEvent(activeEventId, me);
    await joinEvent(activeEventId, other);
    await joinEvent(doneEventId, me);
    await joinEvent(doneEventId, other);

    await asUser(me);
    await client.query("select public.follow_user_atomic($1)", [other]);
    const { rows } = await client.query(
      "select shared_event_count, active_shared_event_count from public.list_connections('following', null, null, 20)"
    );

    const row = rows.find((candidate: { user_id?: string }) => true);
    expect(row).toMatchObject({ shared_event_count: "2", active_shared_event_count: "1" });
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認**

Run: `npx vitest run --config vitest.db.config.ts --reporter=dot tests/db/connection-active-shared-events.test.ts`
Expected: FAIL（`function public.list_active_shared_events(uuid) does not exist` — migration 050がまだテストDBに適用されていない）

- [ ] **Step 3: テストDBにmigration 050を適用する**

Run: `npx supabase db reset` （ローカルのテスト用DBに全migrationを再適用する。既存のCI手順と同じ）

- [ ] **Step 4: テストを実行してGREENになることを確認**

Run: `npx vitest run --config vitest.db.config.ts --reporter=dot tests/db/connection-active-shared-events.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: コミット**

```bash
git.exe add tests/db/connection-active-shared-events.test.ts
git.exe commit -m "test(connections): 進行中の共通イベントRPCのDBテストを追加"
```

---

## Task 3: ドメイン層 — `ConnectionCandidate`と`ActiveSharedEvent`

**Files:**
- Modify: `lib/domain/account/connections.ts`
- Modify: `tests/account/connections.test.ts`

**Interfaces:**
- Produces: `ConnectionCandidate.activeSharedEventCount: number`（既存型への追加）、`type ActiveSharedEvent = { eventId: string; title: string; displayState: EventDisplayState }`、`mapActiveSharedEvent(row): ActiveSharedEvent`（Task 4で使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/account/connections.test.ts`の`baseCandidate`（13-21行目）を書き換え:

```ts
const baseCandidate: ConnectionCandidate = {
  userId: "base",
  displayName: "Base",
  sharedEventCount: 1,
  activeSharedEventCount: 0,
  latestSharedAt: "2026-07-01T00:00:00.000Z",
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};
```

`describe("mapConnectionCandidateRow", ...)`ブロック（69-92行目）を書き換え:

```ts
describe("mapConnectionCandidateRow", () => {
  it("converts an RPC row into a ConnectionCandidate, coercing the bigint counts", () => {
    expect(
      mapConnectionCandidateRow({
        user_id: "row-user",
        display_name: "行のユーザー",
        shared_event_count: "3",
        active_shared_event_count: "1",
        latest_shared_at: "2026-07-01T00:00:00.000Z",
        is_following: true,
        is_followed_by: false,
        is_favorite: false,
        cursor_at: "2026-07-01T00:00:00.000Z",
        cursor_user_id: "row-user"
      })
    ).toEqual({
      userId: "row-user",
      displayName: "行のユーザー",
      sharedEventCount: 3,
      activeSharedEventCount: 1,
      latestSharedAt: "2026-07-01T00:00:00.000Z",
      isFollowing: true,
      isFollowedBy: false,
      isFavorite: false
    });
  });

  it("falls back to an empty string when latest_shared_at is null", () => {
    expect(
      mapConnectionCandidateRow({
        user_id: "row-user",
        display_name: "行のユーザー",
        shared_event_count: 0,
        active_shared_event_count: 0,
        latest_shared_at: null,
        is_following: false,
        is_followed_by: false,
        is_favorite: false,
        cursor_at: "2026-07-01T00:00:00.000Z",
        cursor_user_id: "row-user"
      }).latestSharedAt
    ).toBe("");
  });
});
```

`describe("mapConnectionPage", ...)`の`row`ヘルパー（112-122行目）を書き換え:

```ts
  const row = (userId: string) => ({
    user_id: userId,
    display_name: userId,
    shared_event_count: 1,
    active_shared_event_count: 1,
    latest_shared_at: "2026-07-01T00:00:00.000Z",
    is_following: false,
    is_followed_by: false,
    is_favorite: false,
    cursor_at: "2026-07-01T00:00:00.000Z",
    cursor_user_id: userId
  });
```

同ファイルの末尾（`describe("mapConnectionCounts", ...)`ブロックの直後）に追加:

```ts

describe("mapActiveSharedEvent", () => {
  it("converts an RPC row into an ActiveSharedEvent", () => {
    expect(
      mapActiveSharedEvent({
        event_id: "event-1",
        title: "夏の集まり",
        display_state: "event_waiting"
      })
    ).toEqual({
      eventId: "event-1",
      title: "夏の集まり",
      displayState: "event_waiting"
    });
  });
});
```

同ファイル冒頭のimportに`mapActiveSharedEvent`を追加:

```ts
import {
  isMutualFollow,
  mapActiveSharedEvent,
  mapConnectionCandidateRow,
  mapConnectionCounts,
  mapConnectionPage,
  sortInviteCandidates,
  toBlockedUser,
  type ConnectionCandidate
} from "@/lib/domain/account/connections";
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/account/connections.test.ts`
Expected: FAIL（`mapActiveSharedEvent is not a function` 等、型エラー含む）

- [ ] **Step 3: 実装を書く**

`lib/domain/account/connections.ts`の冒頭に`EventDisplayState`型のimportを追加:

```ts
import type { EventDisplayState } from "@/lib/domain/event/event-filter";
```

`ConnectionCandidate`型（1-9行目）を書き換え:

```ts
export type ConnectionCandidate = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  activeSharedEventCount: number;
  latestSharedAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFavorite: boolean;
};
```

`ConnectionRpcRow`型（22-32行目）を書き換え:

```ts
type ConnectionRpcRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  active_shared_event_count: number | string;
  latest_shared_at: string | null;
  is_following: boolean;
  is_followed_by: boolean;
  is_favorite: boolean;
  cursor_at: string;
  cursor_user_id: string;
};
```

`mapConnectionCandidateRow`（34-44行目）を書き換え:

```ts
export function mapConnectionCandidateRow(row: ConnectionRpcRow): ConnectionCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    activeSharedEventCount: Number(row.active_shared_event_count),
    latestSharedAt: row.latest_shared_at ?? "",
    isFollowing: row.is_following,
    isFollowedBy: row.is_followed_by,
    isFavorite: row.is_favorite
  };
}
```

ファイル末尾に追加:

```ts

export type ActiveSharedEvent = {
  eventId: string;
  title: string;
  displayState: EventDisplayState;
};

type ActiveSharedEventRpcRow = {
  event_id: string;
  title: string;
  display_state: string;
};

export function mapActiveSharedEvent(row: ActiveSharedEventRpcRow): ActiveSharedEvent {
  return {
    eventId: row.event_id,
    title: row.title,
    displayState: row.display_state as EventDisplayState
  };
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/account/connections.test.ts`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー0件（`ConnectionCandidate`を使う既存ファイル全てで新フィールドの扱いを確認。この時点で`tests/account/connection-list.test.tsx`と`components/account/connection-list.tsx`はまだ直していないのでコンパイルエラーが出る想定 — Task 6で解消する）

- [ ] **Step 6: コミット**

```bash
git.exe add lib/domain/account/connections.ts tests/account/connections.test.ts
git.exe commit -m "feat(connections): ConnectionCandidateにactiveSharedEventCount、ActiveSharedEvent型を追加"
```

---

## Task 4: Server Action — `loadActiveSharedEventsAction`

**Files:**
- Modify: `lib/actions/account/connections.ts`
- Test: `tests/account/actions/load-active-shared-events.test.ts`

**Interfaces:**
- Consumes: `mapActiveSharedEvent`, `type ActiveSharedEvent` from Task 3
- Produces: `loadActiveSharedEventsAction(otherUserId: string): Promise<ActiveSharedEvent[]>`（Task 6で使う）

- [ ] **Step 1: 失敗するテストを書く**

既存の`tests/account/actions/`ディレクトリの他ファイルと同じモック方式を使う。`tests/account/actions/load-active-shared-events.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const { getCurrentActiveUser, createSupabaseServerClient, redirect } = vi.hoisted(() => ({
  getCurrentActiveUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentActiveUser,
  createSupabaseServerClient,
  createSupabaseAdminClient: vi.fn()
}));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: vi.fn()
}));

import { loadActiveSharedEventsAction } from "@/lib/actions/account/connections";

describe("loadActiveSharedEventsAction", () => {
  it("list_active_shared_eventsを呼び、ActiveSharedEventの配列に変換する", async () => {
    getCurrentActiveUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ event_id: "event-1", title: "夏の集まり", display_state: "event_waiting" }],
      error: null
    });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    const result = await loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222");

    expect(rpc).toHaveBeenCalledWith("list_active_shared_events", {
      p_other_user_id: "22222222-2222-4222-8222-222222222222"
    });
    expect(result).toEqual([{ eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" }]);
  });

  it("未ログインならログイン画面へredirectする", async () => {
    getCurrentActiveUser.mockResolvedValue(null);
    redirect.mockImplementation(() => {
      throw new Error("REDIRECT");
    });

    await expect(
      loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222")
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("RPCがエラーを返したら例外を投げる", async () => {
    getCurrentActiveUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await expect(
      loadActiveSharedEventsAction("22222222-2222-4222-8222-222222222222")
    ).rejects.toThrow("進行中の共通イベントを読み込めませんでした");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/account/actions/load-active-shared-events.test.ts`
Expected: FAIL（`loadActiveSharedEventsAction is not a function`）

- [ ] **Step 3: 実装を書く**

`lib/actions/account/connections.ts`のimportに`mapActiveSharedEvent`, `type ActiveSharedEvent`を追加:

```ts
import {
  mapActiveSharedEvent,
  mapConnectionPage,
  type ActiveSharedEvent,
  type ConnectionCategory,
  type ConnectionCursor,
  type ConnectionPage
} from "@/lib/domain/account/connections";
```

ファイル末尾（`loadEventInviteCandidatesAction`の後、既存の他のexport関数の後ろ）に追加:

```ts

export async function loadActiveSharedEventsAction(otherUserId: string): Promise<ActiveSharedEvent[]> {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const targetUserId = requireTargetUserId(otherUserId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_active_shared_events", {
    p_other_user_id: targetUserId
  });

  if (error) {
    throw new Error("進行中の共通イベントを読み込めませんでした");
  }

  return (data ?? []).map(mapActiveSharedEvent);
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/account/actions/load-active-shared-events.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git.exe add lib/actions/account/connections.ts tests/account/actions/load-active-shared-events.test.ts
git.exe commit -m "feat(connections): loadActiveSharedEventsAction を追加"
```

---

## Task 5: モーダルコンポーネント — `ActiveSharedEventsModal`

**Files:**
- Create: `components/account/active-shared-events-modal.tsx`
- Test: `tests/account/active-shared-events-modal.test.tsx`

**Interfaces:**
- Consumes: `type ActiveSharedEvent` from `@/lib/domain/account/connections`、`eventDisplayStateLabels` from `@/lib/domain/event/event-filter`
- Produces: `ActiveSharedEventsModal({ displayName, events, onClose })`（Task 6で使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/account/active-shared-events-modal.test.tsx`（`tests/account/legal-modal.test.tsx`と同じ方式）:

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActiveSharedEventsModal } from "@/components/account/active-shared-events-modal";
import type { ActiveSharedEvent } from "@/lib/domain/account/connections";

const events: ActiveSharedEvent[] = [
  { eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" },
  { eventId: "event-2", title: "謎解き公演", displayState: "answer_waiting" }
];

describe("ActiveSharedEventsModal", () => {
  it("イベント名と状態ラベルの行を、イベント詳細へのリンクとして出す", () => {
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={vi.fn()} />);

    const link = screen.getByRole("link", { name: /夏の集まり/ });
    expect(link).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByText("開催待ち")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /謎解き公演/ })).toHaveAttribute("href", "/events/event-2");
    expect(screen.getByText("回答待ち")).toBeInTheDocument();
  });

  it("0件なら空メッセージを出す", () => {
    render(<ActiveSharedEventsModal displayName="あきらさん" events={[]} onClose={vi.fn()} />);

    expect(screen.getByText("進行中の共通イベントはありません。")).toBeInTheDocument();
  });

  it("閉じるボタンでonCloseを呼ぶ", () => {
    const onClose = vi.fn();
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("Escapeキーで閉じる", () => {
    const onClose = vi.fn();
    render(<ActiveSharedEventsModal displayName="あきらさん" events={events} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/account/active-shared-events-modal.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装を書く**

`components/account/active-shared-events-modal.tsx`:

```tsx
"use client";

import Link from "next/link";
import React, { useEffect, useId, useRef } from "react";

import { eventDisplayStateLabels } from "@/lib/domain/event/event-filter";
import type { ActiveSharedEvent } from "@/lib/domain/account/connections";

export function ActiveSharedEventsModal({
  displayName,
  events,
  onClose
}: {
  displayName: string;
  events: ActiveSharedEvent[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // 背景へ抜けないように、モーダル内の操作できる要素の間だけを行き来させる。
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/42 px-4 py-8 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-control border border-line bg-cream p-5 shadow-soft"
      >
        <h2 id={titleId} className="text-xl font-bold text-ink">
          {displayName}さんとの進行中のイベント
        </h2>

        <div className="mt-4 flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-muted">進行中の共通イベントはありません。</p>
          ) : (
            <ul className="grid gap-2">
              {events.map((event) => (
                <li key={event.eventId}>
                  <Link
                    href={`/events/${event.eventId}`}
                    className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    <span className="font-bold text-ink">{event.title}</span>
                    <span className="whitespace-nowrap text-sm text-muted">
                      {eventDisplayStateLabels[event.displayState]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-line pt-4">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/account/active-shared-events-modal.test.tsx`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git.exe add components/account/active-shared-events-modal.tsx tests/account/active-shared-events-modal.test.tsx
git.exe commit -m "feat(connections): ActiveSharedEventsModal コンポーネントを追加"
```

---

## Task 6: `ConnectionRow`への配線

**Files:**
- Modify: `components/account/connection-list.tsx`
- Modify: `tests/account/connection-list.test.tsx`

**Interfaces:**
- Consumes: `loadActiveSharedEventsAction`（Task 4）、`ActiveSharedEventsModal`（Task 5）、`type ActiveSharedEvent`（Task 3）

- [ ] **Step 1: 失敗するテストを書く**

`tests/account/connection-list.test.tsx`のfixture（29-55行目）に`activeSharedEventCount`を追加:

```ts
const favorite: ConnectionCandidate = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "あきらさん",
  sharedEventCount: 3,
  activeSharedEventCount: 2,
  latestSharedAt: "2026-07-01T10:00:00.000Z",
  isFollowing: true,
  isFollowedBy: true,
  isFavorite: true
};

const following: ConnectionCandidate = {
  ...favorite,
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "はるかさん",
  activeSharedEventCount: 0,
  isFollowing: true,
  isFollowedBy: false,
  isFavorite: false
};

const candidate: ConnectionCandidate = {
  ...favorite,
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "みなとさん",
  activeSharedEventCount: 0,
  isFollowing: false,
  isFollowedBy: false,
  isFavorite: false
};
```

（`favorite`は`activeSharedEventCount: 2`のまま残す＝ボタンが出るケース、`following`/`candidate`は`0`＝出ないケースとして使う）

`vi.hoisted`のモックに`loadActiveSharedEventsAction`を追加（5-18行目を書き換え）:

```ts
const { unblockUserAction, unfollowUserAction, loadMoreConnectionsAction, loadActiveSharedEventsAction } = vi.hoisted(
  () => ({
    unblockUserAction: vi.fn().mockResolvedValue(undefined),
    unfollowUserAction: vi.fn(),
    loadMoreConnectionsAction: vi.fn(),
    loadActiveSharedEventsAction: vi.fn()
  })
);

vi.mock("@/lib/actions/account/connections", () => ({
  blockUserAction: vi.fn(),
  followUserAction: vi.fn(),
  toggleFavoriteAction: vi.fn(),
  unfollowUserAction,
  unblockUserAction,
  loadMoreConnectionsAction,
  loadActiveSharedEventsAction
}));
```

ファイル末尾（既存のテストの最後、`describe`の閉じ`}`の直前）に追加:

```ts

describe("進行中の共通イベント", () => {
  it("activeSharedEventCountが0より大きいときだけボタンを出す", () => {
    render(
      <ConnectionList
        favorites={{ items: [favorite], totalCount: 1, nextCursor: null }}
        following={{ items: [following], totalCount: 1, nextCursor: null }}
        candidates={{ items: [candidate], totalCount: 1, nextCursor: null }}
      />
    );

    expect(screen.getByRole("button", { name: "進行中 2件" })).toBeInTheDocument();
  });

  it("押すとloadActiveSharedEventsActionを呼び、結果をモーダルに表示する", async () => {
    loadActiveSharedEventsAction.mockResolvedValue([
      { eventId: "event-1", title: "夏の集まり", displayState: "event_waiting" }
    ]);

    render(<ConnectionList favorites={{ items: [favorite], totalCount: 1, nextCursor: null }} following={{ items: [], totalCount: 0, nextCursor: null }} candidates={{ items: [], totalCount: 0, nextCursor: null }} />);

    fireEvent.click(screen.getByRole("button", { name: "進行中 2件" }));

    await waitFor(() => {
      expect(loadActiveSharedEventsAction).toHaveBeenCalledWith(favorite.userId);
    });
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /夏の集まり/ })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/account/connection-list.test.tsx`
Expected: FAIL（新しい2件が失敗。既存のテストは型チェックの都合でこの時点ではまだ`activeSharedEventCount`未対応でも実行はできるが、TypeScriptの型エラーとしてはTask 3の時点から出ている）

- [ ] **Step 3: 実装を書く**

`components/account/connection-list.tsx`のimportに追加:

```ts
import { ActiveSharedEventsModal } from "@/components/account/active-shared-events-modal";
```

既存のimportブロック（8-24行目）を書き換え:

```ts
import {
  blockUserAction,
  followUserAction,
  loadActiveSharedEventsAction,
  loadMoreConnectionsAction,
  toggleFavoriteAction,
  unfollowUserAction,
  unblockUserAction
} from "@/lib/actions/account/connections";
import type { ActionState } from "@/lib/domain/shared/action-state";
import {
  isMutualFollow,
  toBlockedUser,
  type ActiveSharedEvent,
  type BlockedUser,
  type ConnectionCandidate,
  type ConnectionCategory,
  type ConnectionCursor
} from "@/lib/domain/account/connections";
```

`ConnectionRow`関数（261行目付近）を書き換え:

```tsx
function ConnectionRow({ person }: { person: ConnectionCandidate }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [activeEvents, setActiveEvents] = useState<ActiveSharedEvent[] | null>(null);
  const [isLoadingActiveEvents, startActiveEventsTransition] = useTransition();
  const [activeEventsError, setActiveEventsError] = useState<string | null>(null);

  function run(action: (userId: string) => Promise<ActionState>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(person.userId);
        if (result.status === "error") {
          setError(result.message ?? "操作を完了できませんでした。");
        }
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "操作を完了できませんでした。");
      }
    });
  }

  function openActiveEventsModal() {
    setActiveEventsError(null);
    startActiveEventsTransition(async () => {
      try {
        const events = await loadActiveSharedEventsAction(person.userId);
        setActiveEvents(events);
      } catch (cause) {
        unstable_rethrow(cause);
        setActiveEventsError(cause instanceof Error ? cause.message : "読み込めませんでした。");
      }
    });
  }

  return (
    <article className="rounded-control border border-line bg-surface p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{person.displayName}</p>
          <p className="mt-1 text-sm text-muted">
            共通のイベント {person.sharedEventCount}件
            {isMutualFollow(person) ? "・相互フォロー" : person.isFollowing ? "・フォロー中" : ""}
          </p>
          {person.activeSharedEventCount > 0 ? (
            <button
              type="button"
              disabled={isLoadingActiveEvents}
              onClick={openActiveEventsModal}
              className="mt-1 inline-flex min-h-6 items-center text-sm font-bold text-pine underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-clay disabled:cursor-not-allowed disabled:opacity-60"
            >
              進行中 {person.activeSharedEventCount}件
            </button>
          ) : null}
          {activeEventsError ? <p className="mt-1 text-sm text-clay-ink">{activeEventsError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={person.isFollowing ? "フォローを解除" : "フォロー"}
            icon={person.isFollowing ? UserMinus : UserPlus}
            disabled={isPending}
            onClick={() => run(person.isFollowing ? unfollowUserAction : followUserAction)}
          />
          <ActionButton
            label={person.isFavorite ? "お気に入りを外す" : "お気に入りにする"}
            icon={Heart}
            disabled={isPending || (!person.isFollowing && !person.isFavorite)}
            active={person.isFavorite}
            title={person.isFollowing || person.isFavorite ? undefined : "フォローするとお気に入りにできます"}
            onClick={() => run(toggleFavoriteAction)}
          />
          <ActionButton label="ブロック" icon={ShieldBan} disabled={isPending} danger onClick={() => setConfirmingBlock(true)} />
        </div>
      </div>
```

（この直後、既存の`{confirmingBlock ? (...)}`ブロックはそのまま。`error`の表示部分も既存のまま。`</article>`の直前に、モーダルのレンダリングを追加）

既存の`ConnectionRow`の`return`の末尾、`</article>`の直前に追加:

```tsx
      {activeEvents ? (
        <ActiveSharedEventsModal
          displayName={person.displayName}
          events={activeEvents}
          onClose={() => setActiveEvents(null)}
        />
      ) : null}
    </article>
  );
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/account/connection-list.test.tsx`
Expected: PASS（既存＋新規2件）

- [ ] **Step 5: 全体テストと型チェック**

Run: `npx vitest run --reporter=dot tests/account`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: エラー0件

Run: `npx eslint lib/domain/account/connections.ts lib/actions/account/connections.ts components/account/connection-list.tsx components/account/active-shared-events-modal.tsx`
Expected: エラー0件

- [ ] **Step 6: コミット**

```bash
git.exe add components/account/connection-list.tsx tests/account/connection-list.test.tsx
git.exe commit -m "feat(connections): 人物行に「進行中◯件」ボタンとモーダルを配線"
```

---

## 全体の最終確認

- [ ] Run: `npx vitest run --reporter=dot tests/account`
  Expected: 全件PASS
- [ ] Run: `npx tsc --noEmit`
  Expected: エラー0件
- [ ] Run: `npx eslint .`（変更したファイルが対象に含まれること）
  Expected: エラー0件
- [ ] **migration 050はここではまだ本番へ適用しない。** ユーザーに内容を確認してもらい、承認を得てから適用する
- [ ] 実ブラウザで`/connections`を開き、共通の進行中イベントがある相手の行に「進行中◯件」ボタンが出ること、押すとモーダルが開いてイベント名・状態ラベルが並ぶこと、Escapeで閉じられることを確認する
