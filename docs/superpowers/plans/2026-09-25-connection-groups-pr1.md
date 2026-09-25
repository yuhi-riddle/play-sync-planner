# つながりのグループ PR① 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自分だけに見える「グループ」を作れるようにし、つながり画面を「よく遊ぶ仲間をまとめて、次のイベントに誘う場所」に作り直す。お気に入りは画面からなくし、データはグループへ移す。

**Architecture:** 表2つ（`connection_groups` / `connection_group_members`）と SECURITY DEFINER の RPC を migration 053 で足す。お気に入りの移行は migration 054 の関数で行い、デプロイ直後に本番へ適用する。画面はつながり画面（グループの欄＋人の一覧）とグループ画面 `/connections/groups/[groupId]`（メンバーの一覧と編集）。

**Tech Stack:** Next.js 15 App Router / React 19 / Supabase（Postgres 16、RPC）/ Tailwind / Vitest（jsdom・DB）

**設計:** `docs/superpowers/specs/2026-09-25-connection-groups-design.md`

## Global Constraints

- グループ名は前後の空白を除いて1〜20文字。自分のグループ同士で同じ名前は不可
- 色のキーは `nazotoki` / `boardgame` / `travel` / `live` / `drinking` / `snowboard` / `movie_stage` / `honey` の8つ。この順で並べ、1番目（`nazotoki`）を既定にする。`movie_stage` はカテゴリ定数（`lib/shared/constants.ts`）と同じ綴り
- 上限: 1人20グループ、1グループ30人。お気に入りから移したグループは30人を超えても残し、追加だけ止める
- 入れられる人: 自分以外で、ブロック関係（どちら向きでも）になく、一緒に参加したイベントがあるか自分がフォローしている人
- グループは作った本人にしか見えない。他人のグループ ID は「存在しない」と同じ扱い（画面は404）
- 書き込みの RPC はすべて、認証直後に `private.try_consume_authenticated_rate_limit_once('connection_update')` を消費する（制限超過は `PSP02`）
- 新しいエラーコード: `PSP05` グループ数の上限、`PSP06` メンバー数の上限、`PSP07` 同じ名前、`PSP08` 入れられない人、`PSP09` グループが見つからない、`PSP10` 名前か色が不正
- 新しい RPC は `security definer`、`set search_path = ''`、テーブル名はスキーマ修飾。`public` と `anon` から実行権を剥がし、`authenticated` と `service_role` に付与する
- 画面の文言は「グループ」「グループに入れる」「メンバー」。「お気に入り」はつながり画面・グループ画面・招待候補の画面に出さない
- 招待候補のサーバー側の並び順は変えない
- 適用済みの migration ファイルは書き換えない。変更は新しい番号の migration で行う
- 本番 DB への適用は、そのたびにユーザーの承認を得てから行う

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `supabase/migrations/053_connection_groups.sql`（新規） | 表・RLS・内部関数・RPC、`list_connections` と `get_connection_counts` からお気に入りの振り分けを外す、ブロックと退会でグループから外す |
| `supabase/migrations/054_migrate_favorites_to_connection_groups.sql`（新規） | お気に入りを「お気に入り」グループへ移す関数と、その実行 |
| `tests/db/connection-groups.test.ts`（新規） | 053 の RPC・RLS・上限・ブロック・退会・振り分けの DB テスト |
| `tests/db/connection-groups-favorites-migration.test.ts`（新規） | 054 の移行関数の DB テスト |
| `lib/domain/account/connection-groups.ts`（新規） | 型・色・上限・名前の検証・RPC 行の変換 |
| `tests/account/connection-groups.test.ts`（新規） | 上のドメインのテスト |
| `lib/actions/account/connection-groups.ts`（新規） | グループの Server Action |
| `tests/account/actions/connection-groups.test.ts`（新規） | Server Action のテスト |
| `components/account/connection-group-color-field.tsx`（新規） | 8色から選ぶラジオ |
| `components/account/connection-groups-section.tsx`（新規） | つながり画面のグループの欄と作成フォーム |
| `components/account/connection-group-picker.tsx`（新規） | 人の行の「グループに入れる」パネル |
| `components/account/connection-list.tsx`（変更） | お気に入りをなくし、所属グループと「グループに入れる」を足す |
| `app/connections/page.tsx`（変更） | グループを読み込み、案1の並びにする |
| `app/connections/groups/[groupId]/page.tsx`（新規） | グループ画面（サーバー） |
| `components/account/connection-group-detail.tsx`（新規） | グループ画面の中身（名前と色の変更・削除・メンバー） |
| `components/event/event-invite-candidates.tsx`（変更） | 候補の説明から「お気に入り」をなくす |
| `lib/supabase/database.types.ts`（再生成） | 053 を本番に適用したあとに再生成 |
| `docs/superpowers/specs/2026-09-25-connection-groups-design.md`（変更） | 実装で確定した点を反映（Task 10） |

---

### Task 1: migration 053 の表・RLS・内部関数と、作成・一覧の RPC

**Files:**
- Create: `supabase/migrations/053_connection_groups.sql`
- Test: `tests/db/connection-groups.test.ts`

**Interfaces:**
- Produces（SQL）:
  - `public.create_connection_group(p_name text, p_color text, p_member_ids uuid[] default '{}') returns uuid`
  - `public.list_connection_groups() returns table(group_id uuid, name text, color text, member_count bigint, member_names text[], active_event_count bigint, created_at timestamptz)`
  - `public.get_connection_group(p_group_id uuid) returns table(group_id uuid, name text, color text, member_count bigint, created_at timestamptz)`
  - `public.list_connection_group_memberships() returns table(group_id uuid, member_user_id uuid)`
  - 内部: `private.connection_display_name(uuid) returns text`、`private.is_connection_group_member_eligible(uuid, uuid) returns boolean`、`private.consume_connection_group_action() returns uuid`、`private.normalize_connection_group_input(text, text) returns text`、`private.add_connection_group_members_internal(uuid, uuid, uuid[]) returns void`

- [ ] **Step 1: DB テストを書く（失敗するもの）**

`tests/db/connection-groups.test.ts` を作る。ヘルパーは `tests/db/connection-active-shared-events.test.ts:1-55` と同じ形。

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

async function makeEvent(ownerId: string, options: { status?: string; endDate?: string } = {}) {
  const eventId = randomUUID();
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,'会',$3,$4,$4)",
    [eventId, ownerId, options.status ?? "confirmed", options.endDate ?? "2099-01-01"]
  );
  return eventId;
}

async function joinEvent(eventId: string, userId: string, status = "joined") {
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'メンバー','member',$3)",
    [eventId, userId, status]
  );
}

/** me と others 全員が参加しているイベントを1つ作る。 */
async function shareEvent(me: string, ...others: string[]) {
  const eventId = await makeEvent(me);
  await joinEvent(eventId, me);
  for (const other of others) await joinEvent(eventId, other);
  return eventId;
}

async function asUser(userId: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function createGroup(name: string, color = "nazotoki", memberIds: string[] = []) {
  const { rows } = await client.query("select public.create_connection_group($1, $2, $3::uuid[]) as id", [
    name,
    color,
    memberIds
  ]);
  return rows[0].id as string;
}

/**
 * エラーが起きるとトランザクション全体が中断するので、セーブポイントで囲んで
 * 同じテストの中で続けてクエリを流せるようにする。
 */
async function expectErrorCode(run: () => Promise<unknown>, code: string) {
  await client.query("savepoint expect_error");
  await expect(run()).rejects.toMatchObject({ code });
  await client.query("rollback to savepoint expect_error");
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

describe("create_connection_group / list_connection_groups", () => {
  it("作ったグループを、人数・メンバー名・作った順で返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);

    await createGroup("謎解き仲間", "nazotoki", [aya]);
    await createGroup("大学の友達", "boardgame");

    const { rows } = await client.query(
      "select name, color, member_count, member_names, active_event_count from public.list_connection_groups()"
    );
    expect(rows).toEqual([
      { name: "謎解き仲間", color: "nazotoki", member_count: "1", member_names: ["メンバー"], active_event_count: "1" },
      { name: "大学の友達", color: "boardgame", member_count: "0", member_names: [], active_event_count: "0" }
    ]);
  });

  it("名前の前後の空白は落として保存する", async () => {
    const me = await makeUser();
    await asUser(me);
    await createGroup("  謎解き仲間  ");
    const { rows } = await client.query("select name from public.list_connection_groups()");
    expect(rows[0].name).toBe("謎解き仲間");
  });

  it("空の名前・21文字以上・不正な色は PSP10", async () => {
    const me = await makeUser();
    await asUser(me);
    await expectErrorCode(() => createGroup("   "), "PSP10");
    await expectErrorCode(() => createGroup("あ".repeat(21)), "PSP10");
    await expectErrorCode(() => createGroup("謎解き仲間", "black"), "PSP10");
  });

  it("自分の別グループと同じ名前は PSP07。他人とは同じ名前でよい", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    await createGroup("謎解き仲間");
    await expectErrorCode(() => createGroup("謎解き仲間"), "PSP07");

    await asUser(other);
    await expect(createGroup("謎解き仲間")).resolves.toEqual(expect.any(String));
  });

  it("21個目は PSP05", async () => {
    const me = await makeUser();
    await asUser(me);
    for (let i = 1; i <= 20; i += 1) await createGroup(`グループ${i}`);
    await expectErrorCode(() => createGroup("グループ21"), "PSP05");
  });

  it("一緒に参加しておらずフォローもしていない人、ブロック関係の人は PSP08", async () => {
    const me = await makeUser();
    const stranger = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, blocked);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);
    await asUser(me);

    await expectErrorCode(() => createGroup("A", "nazotoki", [stranger]), "PSP08");
    await expectErrorCode(() => createGroup("B", "nazotoki", [blocked]), "PSP08");
    await expectErrorCode(() => createGroup("C", "nazotoki", [me]), "PSP08");
  });

  it("フォローしているだけの人も入れられる", async () => {
    const me = await makeUser();
    const followed = await makeUser();
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2)", [
      me,
      followed
    ]);
    await asUser(me);
    await expect(createGroup("A", "nazotoki", [followed])).resolves.toEqual(expect.any(String));
  });

  it("未ログインでは作れない", async () => {
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
    await expect(createGroup("A")).rejects.toThrow(/Authentication required/);
  });
});

describe("get_connection_group / list_connection_group_memberships", () => {
  it("他人のグループは空で返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    const mine = await client.query("select name, member_count from public.get_connection_group($1)", [groupId]);
    expect(mine.rows).toEqual([{ name: "謎解き仲間", member_count: "1" }]);
    const memberships = await client.query("select group_id, member_user_id from public.list_connection_group_memberships()");
    expect(memberships.rows).toEqual([{ group_id: groupId, member_user_id: aya }]);

    await asUser(other);
    expect((await client.query("select * from public.get_connection_group($1)", [groupId])).rows).toEqual([]);
    expect((await client.query("select * from public.list_connection_group_memberships()")).rows).toEqual([]);
  });

  it("active_event_count は、メンバーが1人でも参加している進行中のイベントだけ数える", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    await shareEvent(me, aya, ken); // 2人とも参加（1件）
    await shareEvent(me, ken); // ken だけ（1件）
    const done = await makeEvent(me, { status: "done", endDate: "2020-01-01" });
    await joinEvent(done, me);
    await joinEvent(done, aya); // 終わったイベントは数えない
    await asUser(me);
    await createGroup("仲間", "nazotoki", [aya, ken]);

    const { rows } = await client.query("select active_event_count from public.list_connection_groups()");
    expect(rows[0].active_event_count).toBe("2");
  });
});

describe("RLS", () => {
  it("authenticated から他人のグループを直接読めず、直接書き込みもできない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");

    await client.query("set local role authenticated");
    await asUser(other);
    expect((await client.query("select id from public.connection_groups where id = $1", [groupId])).rows).toEqual([]);
    await client.query("savepoint direct_insert");
    await expect(
      client.query("insert into public.connection_groups (owner_user_id, name) values ($1, 'x')", [other])
    ).rejects.toThrow();
    await client.query("rollback to savepoint direct_insert");

    await asUser(me);
    expect((await client.query("select id from public.connection_groups where id = $1", [groupId])).rows).toHaveLength(1);
    await client.query("reset role");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:db -- tests/db/connection-groups.test.ts`
Expected: FAIL（`function public.create_connection_group(...) does not exist`）。ローカルに Postgres が無い場合は、ブランチを push して CI の `db-tests` ジョブで失敗を確認する。

- [ ] **Step 3: migration を書く**

`supabase/migrations/053_connection_groups.sql`:

```sql
-- つながりのグループ（自分だけに見える仕分け）。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md
--
-- エラーコード:
--   PSP05 グループ数の上限（20）
--   PSP06 メンバー数の上限（30）
--   PSP07 同じ名前のグループがある
--   PSP08 入れられない人（本人・ブロック関係・一緒に参加もフォローもしていない）
--   PSP09 グループが見つからない（他人のグループも含む）
--   PSP10 名前か色が不正

begin;

create table public.connection_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'nazotoki',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_groups_name_check check (name = btrim(name) and char_length(name) between 1 and 20),
  constraint connection_groups_color_check check (
    color in ('nazotoki', 'boardgame', 'travel', 'live', 'drinking', 'snowboard', 'movie_stage', 'honey')
  ),
  constraint connection_groups_owner_name_key unique (owner_user_id, name)
);

create index connection_groups_owner_created_idx
on public.connection_groups(owner_user_id, created_at, id);

create table public.connection_group_members (
  group_id uuid not null references public.connection_groups(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_user_id)
);

create index connection_group_members_member_idx
on public.connection_group_members(member_user_id);

-- 読み取りだけ本人に許す。書き込みは下の RPC からだけ行う（ポリシーを作らない）。
alter table public.connection_groups enable row level security;
alter table public.connection_group_members enable row level security;

create policy "Owners can read their connection groups"
on public.connection_groups
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "Owners can read their connection group members"
on public.connection_group_members
for select
to authenticated
using (
  exists (
    select 1
    from public.connection_groups as owned_group
    where owned_group.id = connection_group_members.group_id
      and owned_group.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 内部関数
-- ---------------------------------------------------------------------------

-- 表示名は list_connections（migration 050）と同じ順で決める。
create or replace function private.connection_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim((select profile.nickname from public.profiles as profile where profile.user_id = p_user_id)), ''),
    nullif(btrim((
      select event_member.display_name
      from public.event_members as event_member
      where event_member.user_id = p_user_id
      order by event_member.created_at desc, event_member.event_id desc
      limit 1
    )), ''),
    'Madoiユーザー'
  );
$$;

create or replace function private.is_connection_group_member_eligible(p_owner uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_member is not null
    and p_member <> p_owner
    and not public.is_user_blocked(p_owner, p_member)
    and (
      public.have_shared_event(p_owner, p_member)
      or exists (
        select 1
        from public.user_connections as following
        where following.follower_user_id = p_owner
          and following.followed_user_id = p_member
      )
    );
$$;

-- 認証と回数制限をまとめて行い、操作する本人の ID を返す。
create or replace function private.consume_connection_group_action()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_retry_seconds integer;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  v_retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if v_retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = v_retry_seconds::text;
  end if;

  return v_actor;
end;
$$;

-- 名前を整えて返す。名前か色が不正なら PSP10。
create or replace function private.normalize_connection_group_input(p_name text, p_color text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 20
     or p_color is null
     or p_color not in ('nazotoki', 'boardgame', 'travel', 'live', 'drinking', 'snowboard', 'movie_stage', 'honey') then
    raise exception using errcode = 'PSP10', message = 'Invalid connection group name or color';
  end if;
  return v_name;
end;
$$;

create or replace function private.add_connection_group_members_internal(
  p_owner uuid,
  p_group_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_ids uuid[];
  v_current_count integer;
  v_new_count integer;
begin
  select coalesce(array_agg(distinct member_id), '{}')
  into v_member_ids
  from unnest(coalesce(p_member_ids, '{}')) as member_id;

  if cardinality(v_member_ids) = 0 then
    return;
  end if;

  if exists (
    select 1
    from unnest(v_member_ids) as member_id
    where not private.is_connection_group_member_eligible(p_owner, member_id)
  ) then
    raise exception using errcode = 'PSP08', message = 'Member is not eligible';
  end if;

  select count(*) into v_current_count
  from public.connection_group_members as member
  where member.group_id = p_group_id;

  select count(*) into v_new_count
  from unnest(v_member_ids) as member_id
  where not exists (
    select 1
    from public.connection_group_members as member
    where member.group_id = p_group_id
      and member.member_user_id = member_id
  );

  if v_new_count > 0 and v_current_count + v_new_count > 30 then
    raise exception using errcode = 'PSP06', message = 'Member limit reached';
  end if;

  insert into public.connection_group_members (group_id, member_user_id)
  select p_group_id, member_id
  from unnest(v_member_ids) as member_id
  on conflict (group_id, member_user_id) do nothing;
end;
$$;

revoke all on function private.connection_display_name(uuid) from public;
revoke all on function private.is_connection_group_member_eligible(uuid, uuid) from public;
revoke all on function private.consume_connection_group_action() from public;
revoke all on function private.normalize_connection_group_input(text, text) from public;
revoke all on function private.add_connection_group_members_internal(uuid, uuid, uuid[]) from public;

-- ---------------------------------------------------------------------------
-- 作成・一覧
-- ---------------------------------------------------------------------------

create function public.create_connection_group(
  p_name text,
  p_color text,
  p_member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_name text := private.normalize_connection_group_input(p_name, p_color);
  v_group_id uuid;
begin
  if (select count(*) from public.connection_groups as owned where owned.owner_user_id = v_actor) >= 20 then
    raise exception using errcode = 'PSP05', message = 'Group limit reached';
  end if;

  if exists (
    select 1 from public.connection_groups as owned
    where owned.owner_user_id = v_actor and owned.name = v_name
  ) then
    raise exception using errcode = 'PSP07', message = 'Duplicate group name';
  end if;

  insert into public.connection_groups (owner_user_id, name, color)
  values (v_actor, v_name, p_color)
  returning id into v_group_id;

  perform private.add_connection_group_members_internal(v_actor, v_group_id, p_member_ids);

  return v_group_id;
end;
$$;

create function public.list_connection_groups()
returns table(
  group_id uuid,
  name text,
  color text,
  member_count bigint,
  member_names text[],
  active_event_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    owned.id,
    owned.name,
    owned.color,
    (select count(*) from public.connection_group_members as member where member.group_id = owned.id)::bigint,
    coalesce((
      select array_agg(first_members.display_name order by first_members.created_at, first_members.member_user_id)
      from (
        select member.member_user_id, member.created_at, private.connection_display_name(member.member_user_id) as display_name
        from public.connection_group_members as member
        where member.group_id = owned.id
        order by member.created_at, member.member_user_id
        limit 5
      ) as first_members
    ), '{}'::text[]),
    (
      select count(distinct my_membership.event_id)
      from public.event_members as my_membership
      join public.event_members as their_membership
        on their_membership.event_id = my_membership.event_id
        and their_membership.status = 'joined'
      join public.connection_group_members as member
        on member.group_id = owned.id
        and member.member_user_id = their_membership.user_id
      join public.event_activity_state as activity
        on activity.event_id = my_membership.event_id
      where my_membership.user_id = v_actor
        and my_membership.status = 'joined'
        and activity.is_active
    )::bigint,
    owned.created_at
  from public.connection_groups as owned
  where owned.owner_user_id = v_actor
  order by owned.created_at, owned.id;
end;
$$;

create function public.get_connection_group(p_group_id uuid)
returns table(group_id uuid, name text, color text, member_count bigint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    owned.id,
    owned.name,
    owned.color,
    (select count(*) from public.connection_group_members as member where member.group_id = owned.id)::bigint,
    owned.created_at
  from public.connection_groups as owned
  where owned.id = p_group_id
    and owned.owner_user_id = v_actor;
end;
$$;

create function public.list_connection_group_memberships()
returns table(group_id uuid, member_user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select member.group_id, member.member_user_id
  from public.connection_group_members as member
  join public.connection_groups as owned
    on owned.id = member.group_id
  where owned.owner_user_id = v_actor
  order by member.group_id, member.member_user_id;
end;
$$;

revoke all on function public.create_connection_group(text, text, uuid[]) from public;
revoke all on function public.create_connection_group(text, text, uuid[]) from anon;
grant execute on function public.create_connection_group(text, text, uuid[]) to authenticated;
grant execute on function public.create_connection_group(text, text, uuid[]) to service_role;

revoke all on function public.list_connection_groups() from public;
revoke all on function public.list_connection_groups() from anon;
grant execute on function public.list_connection_groups() to authenticated;
grant execute on function public.list_connection_groups() to service_role;

revoke all on function public.get_connection_group(uuid) from public;
revoke all on function public.get_connection_group(uuid) from anon;
grant execute on function public.get_connection_group(uuid) to authenticated;
grant execute on function public.get_connection_group(uuid) to service_role;

revoke all on function public.list_connection_group_memberships() from public;
revoke all on function public.list_connection_group_memberships() from anon;
grant execute on function public.list_connection_group_memberships() to authenticated;
grant execute on function public.list_connection_group_memberships() to service_role;

commit;
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm run test:db -- tests/db/connection-groups.test.ts`
Expected: PASS（Task 1 のテストすべて）。ローカルに Postgres が無い場合は CI の `db-tests` で確認する。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/053_connection_groups.sql tests/db/connection-groups.test.ts
git commit -m "feat(db): つながりのグループの表と、作成・一覧の RPC を足す"
```

---

### Task 2: migration 053 に編集・削除・メンバー操作・候補の RPC を足す

**Files:**
- Modify: `supabase/migrations/053_connection_groups.sql`（Task 1 で作った同じファイルの `commit;` の前に追記。まだ本番未適用なので同じファイルでよい）
- Test: `tests/db/connection-groups.test.ts`

**Interfaces:**
- Consumes: Task 1 の内部関数
- Produces（SQL）:
  - `public.update_connection_group(p_group_id uuid, p_name text, p_color text) returns void`
  - `public.delete_connection_group(p_group_id uuid) returns void`
  - `public.add_connection_group_members(p_group_id uuid, p_member_ids uuid[]) returns void`
  - `public.remove_connection_group_member(p_group_id uuid, p_member_id uuid) returns void`
  - `public.set_person_connection_groups(p_member_id uuid, p_group_ids uuid[]) returns void`
  - `public.list_connection_group_members(p_group_id uuid) returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)`
  - `public.list_connection_group_candidates(p_group_id uuid) returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)`

- [ ] **Step 1: テストを足す（失敗するもの）**

`tests/db/connection-groups.test.ts` の末尾に追加:

```ts
describe("update / delete", () => {
  it("名前と色を変えられる。別グループと同じ名前は PSP07", async () => {
    const me = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");
    await createGroup("大学の友達");

    await client.query("select public.update_connection_group($1, $2, $3)", [groupId, " 謎解き部 ", "honey"]);
    const { rows } = await client.query("select name, color from public.get_connection_group($1)", [groupId]);
    expect(rows).toEqual([{ name: "謎解き部", color: "honey" }]);

    await expectErrorCode(() => 
      client.query("select public.update_connection_group($1, $2, $3)", [groupId, "大学の友達", "honey"]),
      "PSP07"
    );
  });

  it("他人のグループは編集も削除も PSP09", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await asUser(me);
    const groupId = await createGroup("謎解き仲間");

    await asUser(other);
    await expectErrorCode(() => 
      client.query("select public.update_connection_group($1, 'x', 'nazotoki')", [groupId]),
      "PSP09"
    );
    await expectErrorCode(() => client.query("select public.delete_connection_group($1)", [groupId]), "PSP09");
  });

  it("削除するとメンバーも消える", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    await client.query("select public.delete_connection_group($1)", [groupId]);
    expect((await client.query("select * from public.list_connection_groups()")).rows).toEqual([]);
    expect(
      (await client.query("select * from public.connection_group_members where group_id = $1", [groupId])).rows
    ).toEqual([]);
  });
});

describe("メンバーの追加・削除", () => {
  it("30人までは入れられ、31人目は PSP06", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    await asUser(me);
    const groupId = await createGroup("大人数");

    await client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, people.slice(0, 30)]);
    await expectErrorCode(() => 
      client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, [people[30]]]),
      "PSP06"
    );
    // すでにいる人だけを渡したときは上限に関係なく成功する
    await client.query("select public.add_connection_group_members($1, $2::uuid[])", [groupId, [people[0]]]);
  });

  it("外せる。他人のグループからは外せない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    await asUser(other);
    await expectErrorCode(() => client.query("select public.remove_connection_group_member($1, $2)", [groupId, aya]), "PSP09");

    await asUser(me);
    await client.query("select public.remove_connection_group_member($1, $2)", [groupId, aya]);
    const { rows } = await client.query("select member_count from public.get_connection_group($1)", [groupId]);
    expect(rows[0].member_count).toBe("0");
  });
});

describe("set_person_connection_groups", () => {
  it("渡したグループだけに入っている状態にする", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const a = await createGroup("A", "nazotoki", [aya]);
    const b = await createGroup("B");
    const c = await createGroup("C");

    await client.query("select public.set_person_connection_groups($1, $2::uuid[])", [aya, [b, c]]);
    const { rows } = await client.query(
      "select group_id from public.list_connection_group_memberships() where member_user_id = $1 order by group_id",
      [aya]
    );
    expect(rows.map((row) => row.group_id).sort()).toEqual([b, c].sort());
    expect(rows.map((row) => row.group_id)).not.toContain(a);
  });

  it("空の配列ならすべてのグループから外す。入れられない人でも外すことはできる", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await createGroup("A", "nazotoki", [aya]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [me, aya]);

    await client.query("select public.set_person_connection_groups($1, '{}'::uuid[])", [aya]);
    expect((await client.query("select * from public.list_connection_group_memberships()")).rows).toEqual([]);
  });

  it("他人のグループ ID が混ざっていたら PSP09", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(other);
    const othersGroup = await createGroup("他人の");
    await asUser(me);
    await expectErrorCode(() => 
      client.query("select public.set_person_connection_groups($1, $2::uuid[])", [aya, [othersGroup]]),
      "PSP09"
    );
  });
});

describe("list_connection_group_members / list_connection_group_candidates", () => {
  it("メンバーと、まだ入っていない候補を返す。他人のグループは空", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, aya, ken, blocked);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [me, blocked]);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya]);

    const members = await client.query(
      "select user_id, shared_event_count, is_following from public.list_connection_group_members($1)",
      [groupId]
    );
    expect(members.rows).toEqual([{ user_id: aya, shared_event_count: "1", is_following: false }]);

    const candidates = await client.query("select user_id from public.list_connection_group_candidates($1)", [groupId]);
    expect(candidates.rows.map((row) => row.user_id)).toEqual([ken]);

    await asUser(other);
    expect((await client.query("select * from public.list_connection_group_members($1)", [groupId])).rows).toEqual([]);
    expect((await client.query("select * from public.list_connection_group_candidates($1)", [groupId])).rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:db -- tests/db/connection-groups.test.ts`
Expected: FAIL（`function public.update_connection_group(...) does not exist` など）

- [ ] **Step 3: RPC を追記する**

`053_connection_groups.sql` の `commit;` の直前に追記:

```sql
-- ---------------------------------------------------------------------------
-- 編集・削除・メンバー操作
-- ---------------------------------------------------------------------------

create or replace function private.require_owned_connection_group(p_owner uuid, p_group_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_group_id is null or not exists (
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = p_owner
  ) then
    raise exception using errcode = 'PSP09', message = 'Connection group not found';
  end if;
end;
$$;

revoke all on function private.require_owned_connection_group(uuid, uuid) from public;

create function public.update_connection_group(p_group_id uuid, p_name text, p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_name text;
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  v_name := private.normalize_connection_group_input(p_name, p_color);

  if exists (
    select 1 from public.connection_groups as owned
    where owned.owner_user_id = v_actor and owned.name = v_name and owned.id <> p_group_id
  ) then
    raise exception using errcode = 'PSP07', message = 'Duplicate group name';
  end if;

  update public.connection_groups
  set name = v_name, color = p_color, updated_at = now()
  where id = p_group_id;
end;
$$;

create function public.delete_connection_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  delete from public.connection_groups where id = p_group_id;
end;
$$;

create function public.add_connection_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  perform private.add_connection_group_members_internal(v_actor, p_group_id, p_member_ids);
  update public.connection_groups set updated_at = now() where id = p_group_id;
end;
$$;

create function public.remove_connection_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  delete from public.connection_group_members
  where group_id = p_group_id and member_user_id = p_member_id;
  update public.connection_groups set updated_at = now() where id = p_group_id;
end;
$$;

-- 人の行の「グループに入れる」から、その人の所属を渡したグループだけにする。
create function public.set_person_connection_groups(p_member_id uuid, p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_group_ids uuid[];
  v_group_id uuid;
begin
  select coalesce(array_agg(distinct group_id), '{}')
  into v_group_ids
  from unnest(coalesce(p_group_ids, '{}')) as group_id;

  foreach v_group_id in array v_group_ids loop
    perform private.require_owned_connection_group(v_actor, v_group_id);
  end loop;

  delete from public.connection_group_members as member
  using public.connection_groups as owned
  where owned.id = member.group_id
    and owned.owner_user_id = v_actor
    and member.member_user_id = p_member_id
    and not (member.group_id = any (v_group_ids));

  foreach v_group_id in array v_group_ids loop
    perform private.add_connection_group_members_internal(v_actor, v_group_id, array[p_member_id]);
  end loop;
end;
$$;

create function public.list_connection_group_members(p_group_id uuid)
returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    member.member_user_id,
    private.connection_display_name(member.member_user_id),
    (
      select count(*)
      from public.event_members as mine
      join public.event_members as theirs
        on theirs.event_id = mine.event_id
        and theirs.status = 'joined'
        and theirs.user_id = member.member_user_id
      where mine.user_id = v_actor
        and mine.status = 'joined'
    )::bigint,
    exists (
      select 1 from public.user_connections as following
      where following.follower_user_id = v_actor
        and following.followed_user_id = member.member_user_id
    )
  from public.connection_group_members as member
  join public.connection_groups as owned
    on owned.id = member.group_id
    and owned.owner_user_id = v_actor
  where member.group_id = p_group_id
  order by member.created_at, member.member_user_id;
end;
$$;

-- グループ画面の「メンバーを追加」の候補。最大100人。
create function public.list_connection_group_candidates(p_group_id uuid)
returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = v_actor
  ) then
    return;
  end if;

  return query
  with shared as (
    select other.user_id, count(*)::bigint as shared_event_count, max(other.created_at) as latest_shared_at
    from public.event_members as mine
    join public.event_members as other
      on other.event_id = mine.event_id
      and other.status = 'joined'
    where mine.user_id = v_actor
      and mine.status = 'joined'
      and other.user_id <> v_actor
    group by other.user_id
  ),
  followed as (
    select following.followed_user_id as user_id
    from public.user_connections as following
    where following.follower_user_id = v_actor
  ),
  people as (
    select
      coalesce(shared.user_id, followed.user_id) as user_id,
      coalesce(shared.shared_event_count, 0::bigint) as shared_event_count,
      shared.latest_shared_at,
      followed.user_id is not null as is_following
    from shared
    full join followed on followed.user_id = shared.user_id
  )
  select
    people.user_id,
    private.connection_display_name(people.user_id),
    people.shared_event_count,
    people.is_following
  from people
  where not public.is_user_blocked(v_actor, people.user_id)
    and not exists (
      select 1 from public.connection_group_members as member
      where member.group_id = p_group_id and member.member_user_id = people.user_id
    )
  order by people.latest_shared_at desc nulls last, people.user_id
  limit 100;
end;
$$;

revoke all on function public.update_connection_group(uuid, text, text) from public;
revoke all on function public.update_connection_group(uuid, text, text) from anon;
grant execute on function public.update_connection_group(uuid, text, text) to authenticated;
grant execute on function public.update_connection_group(uuid, text, text) to service_role;

revoke all on function public.delete_connection_group(uuid) from public;
revoke all on function public.delete_connection_group(uuid) from anon;
grant execute on function public.delete_connection_group(uuid) to authenticated;
grant execute on function public.delete_connection_group(uuid) to service_role;

revoke all on function public.add_connection_group_members(uuid, uuid[]) from public;
revoke all on function public.add_connection_group_members(uuid, uuid[]) from anon;
grant execute on function public.add_connection_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.add_connection_group_members(uuid, uuid[]) to service_role;

revoke all on function public.remove_connection_group_member(uuid, uuid) from public;
revoke all on function public.remove_connection_group_member(uuid, uuid) from anon;
grant execute on function public.remove_connection_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_connection_group_member(uuid, uuid) to service_role;

revoke all on function public.set_person_connection_groups(uuid, uuid[]) from public;
revoke all on function public.set_person_connection_groups(uuid, uuid[]) from anon;
grant execute on function public.set_person_connection_groups(uuid, uuid[]) to authenticated;
grant execute on function public.set_person_connection_groups(uuid, uuid[]) to service_role;

revoke all on function public.list_connection_group_members(uuid) from public;
revoke all on function public.list_connection_group_members(uuid) from anon;
grant execute on function public.list_connection_group_members(uuid) to authenticated;
grant execute on function public.list_connection_group_members(uuid) to service_role;

revoke all on function public.list_connection_group_candidates(uuid) from public;
revoke all on function public.list_connection_group_candidates(uuid) from anon;
grant execute on function public.list_connection_group_candidates(uuid) to authenticated;
grant execute on function public.list_connection_group_candidates(uuid) to service_role;
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm run test:db -- tests/db/connection-groups.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/053_connection_groups.sql tests/db/connection-groups.test.ts
git commit -m "feat(db): グループの編集・削除・メンバー操作・候補の RPC を足す"
```

---

### Task 3: migration 053 にブロック・退会・つながりの振り分けの変更を足す

**Files:**
- Modify: `supabase/migrations/053_connection_groups.sql`（`commit;` の直前に追記）
- Test: `tests/db/connection-groups.test.ts`

**Interfaces:**
- Consumes: `public.block_user_atomic(uuid)`（現行定義は `supabase/migrations/035_authenticated_rate_limits.sql:211`）、`public.finalize_account_withdrawal(uuid)`（`045_account_withdrawal_rpc.sql:32`）、`public.list_connections(...)`（`050_connection_active_shared_events.sql:160`）、`public.get_connection_counts()`（`034_connection_calendar_rpc.sql:43`）
- Produces: 上の4関数の新しい定義（引数と戻り値は変えない）

- [ ] **Step 1: テストを足す（失敗するもの）**

`tests/db/connection-groups.test.ts` の末尾に追加:

```ts
describe("ブロック・退会", () => {
  it("ブロックすると、相手を自分のグループから、自分を相手のグループから外す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const mine = await createGroup("自分の", "nazotoki", [aya]);
    await asUser(aya);
    const theirs = await createGroup("相手の", "nazotoki", [me]);

    await asUser(me);
    await client.query("select public.block_user_atomic($1)", [aya]);

    const { rows } = await client.query(
      "select group_id from public.connection_group_members where group_id = any($1::uuid[])",
      [[mine, theirs]]
    );
    expect(rows).toEqual([]);
  });

  it("退会すると、その人のグループを消し、ほかの人のグループからも外す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const mine = await createGroup("自分の", "nazotoki", [aya]);
    await asUser(aya);
    await createGroup("相手の", "nazotoki", [me]);

    await client.query("select public.finalize_account_withdrawal($1)", [aya]);

    expect((await client.query("select * from public.connection_groups where owner_user_id = $1", [aya])).rows).toEqual([]);
    expect(
      (await client.query("select * from public.connection_group_members where group_id = $1", [mine])).rows
    ).toEqual([]);
  });
});

describe("list_connections / get_connection_counts からお気に入りの振り分けを外す", () => {
  it("お気に入りでフォロー中の人は following に入り、favorites には入らない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2)", [me, aya]);
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, aya]);
    await asUser(me);

    const following = await client.query(
      "select user_id from public.list_connections('following', null, null, 20)"
    );
    expect(following.rows.map((row) => row.user_id)).toEqual([aya]);
    const favorites = await client.query("select user_id from public.list_connections('favorites', null, null, 20)");
    expect(favorites.rows).toEqual([]);

    const counts = await client.query("select category, item_count from public.get_connection_counts()");
    const byCategory = Object.fromEntries(counts.rows.map((row) => [row.category, Number(row.item_count)]));
    expect(byCategory.following).toBe(1);
    expect(byCategory.favorites ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:db -- tests/db/connection-groups.test.ts`
Expected: FAIL（ブロック・退会のあともメンバーが残る。お気に入りの人が `following` に出ない）

- [ ] **Step 3: 4関数を作り直す**

`053_connection_groups.sql` の `commit;` の直前に、次の4つを追記する。

1. `block_user_atomic`: `035_authenticated_rate_limits.sql:211-257` の `create or replace function public.block_user_atomic ... $$;` をそのまま写し、`set search_path = public` もそのまま残す。`delete from public.user_favorites ...;` の直後に次を足す:

```sql
  -- どちら向きのブロックでも、お互いのグループから外す。
  delete from public.connection_group_members as member
  using public.connection_groups as owned
  where owned.id = member.group_id
    and (
      (owned.owner_user_id = current_user_id and member.member_user_id = target_user_id)
      or (owned.owner_user_id = target_user_id and member.member_user_id = current_user_id)
    );
```

写したあとに `revoke all on function public.block_user_atomic(uuid) from anon;` も続けて書く。

2. `finalize_account_withdrawal`: `045_account_withdrawal_rpc.sql:32-65` の関数定義をそのまま写し、`delete from public.user_favorites where favorite_user_id = target_user_id;` の直後に次を足す。写したあとに同ファイル `:67-70` の revoke / grant 4行も続けて書く。

```sql
  delete from public.connection_groups where owner_user_id = target_user_id;
  delete from public.connection_group_members where member_user_id = target_user_id;
```

3. `list_connections`: `050_connection_active_shared_events.sql` の `create or replace function public.list_connections(` から、その関数の `$$;` と直後の revoke / grant までをそのまま写す。ただし `drop function if exists public.list_connections(...)` は写さない（戻り値は変わらないので `create or replace` のままでよい）。写した中の次の1行だけ消す:

```sql
        when relation_state.is_favorite then 'favorites'
```

4. `get_connection_counts`: `034_connection_calendar_rpc.sql` の `create or replace function public.get_connection_counts()` から、その関数の `$$;` と直後の revoke / grant までをそのまま写し、同じく `when relation_state.is_favorite then 'favorites'` の1行だけ消す。

`is_favorite` 列やお気に入りの表を読む部分はこの PR では残す（PR④で消す）。

- [ ] **Step 4: 通ることを確認する**

Run: `npm run test:db`
Expected: PASS（既存の DB テストも含めてすべて）

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/053_connection_groups.sql tests/db/connection-groups.test.ts
git commit -m "feat(db): ブロックと退会でグループから外し、つながりの振り分けからお気に入りを外す"
```

---

### Task 4: migration 054 お気に入りの移行

**Files:**
- Create: `supabase/migrations/054_migrate_favorites_to_connection_groups.sql`
- Test: `tests/db/connection-groups-favorites-migration.test.ts`

**Interfaces:**
- Produces: `private.migrate_favorites_to_connection_groups() returns integer`（移したメンバーの行数を返す。何度呼んでも結果は同じ）

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/db/connection-groups-favorites-migration.test.ts`（先頭には、Task 1 Step 1 のコードブロックの `import` 〜 `afterEach` までのうち、`client`・`makeUser`・`makeEvent`・`joinEvent`・`shareEvent`・`asUser`・`beforeAll`〜`afterEach` をそのまま写す。`createGroup` と `expectErrorCode` は使わない）:

```ts
describe("private.migrate_favorites_to_connection_groups", () => {
  it("お気に入りがいる人ごとに「お気に入り」グループを作り、相手を入れる。何度呼んでも同じ", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const nobody = await makeUser();
    await shareEvent(me, aya, ken);
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2),($1,$3)", [me, aya, ken]);

    await client.query("select private.migrate_favorites_to_connection_groups()");
    await client.query("select private.migrate_favorites_to_connection_groups()");

    const groups = await client.query(
      "select owner_user_id, name, color from public.connection_groups where owner_user_id = any($1::uuid[])",
      [[me, nobody]]
    );
    expect(groups.rows).toEqual([{ owner_user_id: me, name: "お気に入り", color: "nazotoki" }]);

    await asUser(me);
    const members = await client.query("select member_user_id from public.list_connection_group_memberships()");
    expect(members.rows.map((row) => row.member_user_id).sort()).toEqual([aya, ken].sort());
  });

  it("すでに「お気に入り」という名前のグループがあれば、そこへ足す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await client.query("select public.create_connection_group('お気に入り', 'honey', '{}'::uuid[])");
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, aya]);

    await client.query("select private.migrate_favorites_to_connection_groups()");

    const { rows } = await client.query("select name, color, member_count from public.list_connection_groups()");
    expect(rows).toEqual([{ name: "お気に入り", color: "honey", member_count: "1" }]);
  });

  it("31人以上のお気に入りもすべて移す", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    for (const person of people) {
      await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, person]);
    }

    await client.query("select private.migrate_favorites_to_connection_groups()");

    await asUser(me);
    const { rows } = await client.query("select member_count from public.list_connection_groups()");
    expect(rows[0].member_count).toBe("31");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:db -- tests/db/connection-groups-favorites-migration.test.ts`
Expected: FAIL（`function private.migrate_favorites_to_connection_groups() does not exist`）

- [ ] **Step 3: migration を書く**

`supabase/migrations/054_migrate_favorites_to_connection_groups.sql`:

```sql
-- お気に入りを「お気に入り」グループへ移す。
-- 画面からお気に入りがなくなる PR①のデプロイ直後に本番へ適用する。
-- 関数にしてあるので、適用後に作られたお気に入りがあっても、もう一度呼べば足りる。
-- user_favorites 自体は PR④で消すまで残す。

begin;

create or replace function private.migrate_favorites_to_connection_groups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  -- 20グループの上限はここでは見ない（移行分は必ず作る）。
  insert into public.connection_groups (owner_user_id, name, color)
  select distinct favorite.user_id, 'お気に入り', 'nazotoki'
  from public.user_favorites as favorite
  on conflict (owner_user_id, name) do nothing;

  -- 30人の上限もここでは見ない。
  insert into public.connection_group_members (group_id, member_user_id)
  select favorite_group.id, favorite.favorite_user_id
  from public.user_favorites as favorite
  join public.connection_groups as favorite_group
    on favorite_group.owner_user_id = favorite.user_id
    and favorite_group.name = 'お気に入り'
  where not public.is_user_blocked(favorite.user_id, favorite.favorite_user_id)
  on conflict (group_id, member_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.migrate_favorites_to_connection_groups() from public;

select private.migrate_favorites_to_connection_groups();

commit;
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/054_migrate_favorites_to_connection_groups.sql tests/db/connection-groups-favorites-migration.test.ts
git commit -m "feat(db): お気に入りを「お気に入り」グループへ移す関数を足す"
```

---

### Task 5: 【止まって確認】053 を本番に適用し、型を再生成する

053 は表と関数を足すだけで、今の画面の動きを変えない（`list_connections` の振り分けだけは、お気に入りの人が相互フォロー／フォロー中のタブにも出るようになる。今の画面ではお気に入りタブと重複して見える状態が、PR① のデプロイまで続く）。054 はここでは適用しない（Task 11）。

- [ ] **Step 1: ユーザーに承認を求める**

「migration 053（グループの表と RPC、ブロック・退会の更新、つながりの振り分けからお気に入りを外す）を本番に適用してよいか」を、上の影響（デプロイまでお気に入りの人が2つのタブに出る）と一緒に聞く。返事を待つ。`verifying-db-migrations` スキルに従う。

- [ ] **Step 2: 適用する**

承認後、これまでと同じ手順（CLI、`supabase/migrations/053_connection_groups.sql` を本番に流す）で適用し、`select proname from pg_proc where proname like '%connection_group%'` で関数が揃ったことを確かめる。

- [ ] **Step 3: 型を再生成する**

Run: `npx supabase gen types typescript --project-id esheopszeqggftmawdmu --schema public > lib/supabase/database.types.ts`
Expected: `connection_groups`・`connection_group_members` と、Task 1〜2 の RPC が型に現れる。`git diff --stat lib/supabase/database.types.ts` で差分がこの範囲だけか確かめる。

- [ ] **Step 4: 型の上書きを足す**

`lib/supabase/database.ts` の `FunctionOverrides` に次を足す（生成型は `p_member_ids` を必須にするため）:

```ts
  create_connection_group: ReplaceArgs<
    GeneratedDatabase["public"]["Functions"]["create_connection_group"],
    { p_member_ids?: string[] }
  >;
```

- [ ] **Step 5: 型チェックとコミット**

Run: `npx tsc --noEmit`
Expected: エラーなし

```bash
git add lib/supabase/database.types.ts lib/supabase/database.ts
git commit -m "chore(supabase): migration 053 適用後の型を再生成する"
```

---

### Task 6: ドメイン（型・色・上限・名前の検証・変換）

**Files:**
- Create: `lib/domain/account/connection-groups.ts`
- Test: `tests/account/connection-groups.test.ts`

**Interfaces:**
- Produces:
  - `connectionGroupColors: readonly ["nazotoki","boardgame","travel","live","drinking","snowboard","movie_stage","honey"]`
  - `type ConnectionGroupColor`、`defaultConnectionGroupColor: ConnectionGroupColor`
  - `connectionGroupLimits: { groups: 20; members: 30; nameLength: 20 }`
  - `connectionGroupColorLabels: Record<ConnectionGroupColor, string>`、`connectionGroupDotClass: Record<ConnectionGroupColor, string>`
  - `isConnectionGroupColor(value: string): value is ConnectionGroupColor`
  - `normalizeConnectionGroupName(raw: string): { ok: true; name: string } | { ok: false; message: string }`
  - `type ConnectionGroup = { id: string; name: string; color: ConnectionGroupColor; memberCount: number; memberNames: string[]; activeEventCount: number }`
  - `type ConnectionGroupMember = { userId: string; displayName: string; sharedEventCount: number; isFollowing: boolean }`
  - `mapConnectionGroupRow(row): ConnectionGroup`、`mapConnectionGroupMemberRow(row): ConnectionGroupMember`
  - `buildGroupIdsByMember(rows: { group_id: string; member_user_id: string }[]): Record<string, string[]>`
  - `isUuid(value: string): boolean`

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/connection-groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildGroupIdsByMember,
  connectionGroupColors,
  connectionGroupDotClass,
  isConnectionGroupColor,
  isUuid,
  mapConnectionGroupMemberRow,
  mapConnectionGroupRow,
  normalizeConnectionGroupName
} from "@/lib/domain/account/connection-groups";

describe("normalizeConnectionGroupName", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeConnectionGroupName("  謎解き仲間 ")).toEqual({ ok: true, name: "謎解き仲間" });
  });

  it("空と21文字以上は理由つきで弾く", () => {
    expect(normalizeConnectionGroupName("   ")).toEqual({ ok: false, message: "グループ名を入力してください" });
    expect(normalizeConnectionGroupName("あ".repeat(21))).toEqual({
      ok: false,
      message: "グループ名は20文字までです"
    });
    expect(normalizeConnectionGroupName("あ".repeat(20))).toEqual({ ok: true, name: "あ".repeat(20) });
  });
});

describe("colors", () => {
  it("8色すべてに点の色クラスがある", () => {
    expect(connectionGroupColors).toHaveLength(8);
    for (const color of connectionGroupColors) {
      expect(connectionGroupDotClass[color]).toMatch(/^bg-/);
    }
    expect(connectionGroupDotClass.movie_stage).toBe("bg-category-movie-stage");
    expect(connectionGroupDotClass.honey).toBe("bg-honey");
  });

  it("isConnectionGroupColor は8色だけ通す", () => {
    expect(isConnectionGroupColor("nazotoki")).toBe(true);
    expect(isConnectionGroupColor("movie-stage")).toBe(false);
    expect(isConnectionGroupColor("black")).toBe(false);
  });
});

describe("mappers", () => {
  it("RPC の数値文字列を数にし、知らない色は既定色にする", () => {
    expect(
      mapConnectionGroupRow({
        group_id: "g1",
        name: "謎解き仲間",
        color: "unknown",
        member_count: "3",
        member_names: ["あや", "けん", "みお"],
        active_event_count: "2",
        created_at: "2026-09-25T00:00:00Z"
      })
    ).toEqual({ id: "g1", name: "謎解き仲間", color: "nazotoki", memberCount: 3, memberNames: ["あや", "けん", "みお"], activeEventCount: 2 });

    expect(
      mapConnectionGroupMemberRow({ user_id: "u1", display_name: "あや", shared_event_count: "5", is_following: true })
    ).toEqual({ userId: "u1", displayName: "あや", sharedEventCount: 5, isFollowing: true });
  });

  it("buildGroupIdsByMember は人ごとに所属グループの ID をまとめる", () => {
    expect(
      buildGroupIdsByMember([
        { group_id: "a", member_user_id: "u1" },
        { group_id: "b", member_user_id: "u1" },
        { group_id: "a", member_user_id: "u2" }
      ])
    ).toEqual({ u1: ["a", "b"], u2: ["a"] });
  });
});

describe("isUuid", () => {
  it("UUID だけ通す", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account/connection-groups.test.ts`
Expected: FAIL（`Cannot find module '@/lib/domain/account/connection-groups'`）

- [ ] **Step 3: 実装する**

`lib/domain/account/connection-groups.ts`:

```ts
/** 並びの1番目が既定。キーはカテゴリ定数（lib/shared/constants.ts）と同じ綴り。 */
export const connectionGroupColors = [
  "nazotoki",
  "boardgame",
  "travel",
  "live",
  "drinking",
  "snowboard",
  "movie_stage",
  "honey"
] as const;

export type ConnectionGroupColor = (typeof connectionGroupColors)[number];

export const defaultConnectionGroupColor: ConnectionGroupColor = "nazotoki";

export const connectionGroupLimits = { groups: 20, members: 30, nameLength: 20 } as const;

/** 色の選択肢の読み上げと、色を見分けにくい人向けのラベル。 */
export const connectionGroupColorLabels: Record<ConnectionGroupColor, string> = {
  nazotoki: "すみれ",
  boardgame: "みどり",
  travel: "あお",
  live: "ふじ",
  drinking: "もも",
  snowboard: "みずいろ",
  movie_stage: "そら",
  honey: "こがね"
};

/** Tailwind が拾えるよう、クラス名は文字列のまま書く。 */
export const connectionGroupDotClass: Record<ConnectionGroupColor, string> = {
  nazotoki: "bg-category-nazotoki",
  boardgame: "bg-category-boardgame",
  travel: "bg-category-travel",
  live: "bg-category-live",
  drinking: "bg-category-drinking",
  snowboard: "bg-category-snowboard",
  movie_stage: "bg-category-movie-stage",
  honey: "bg-honey"
};

export function isConnectionGroupColor(value: string): value is ConnectionGroupColor {
  return (connectionGroupColors as readonly string[]).includes(value);
}

export function normalizeConnectionGroupName(
  raw: string
): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: "グループ名を入力してください" };
  if ([...name].length > connectionGroupLimits.nameLength) {
    return { ok: false, message: `グループ名は${connectionGroupLimits.nameLength}文字までです` };
  }
  return { ok: true, name };
}

export type ConnectionGroup = {
  id: string;
  name: string;
  color: ConnectionGroupColor;
  memberCount: number;
  /** 先頭5人まで。 */
  memberNames: string[];
  activeEventCount: number;
};

export type ConnectionGroupMember = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  isFollowing: boolean;
};

type ConnectionGroupRpcRow = {
  group_id: string;
  name: string;
  color: string;
  member_count: number | string;
  member_names: string[] | null;
  active_event_count: number | string;
  created_at: string;
};

type ConnectionGroupMemberRpcRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  is_following: boolean;
};

export function mapConnectionGroupRow(row: ConnectionGroupRpcRow): ConnectionGroup {
  return {
    id: row.group_id,
    name: row.name,
    color: isConnectionGroupColor(row.color) ? row.color : defaultConnectionGroupColor,
    memberCount: Number(row.member_count),
    memberNames: row.member_names ?? [],
    activeEventCount: Number(row.active_event_count)
  };
}

export function mapConnectionGroupMemberRow(row: ConnectionGroupMemberRpcRow): ConnectionGroupMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    isFollowing: row.is_following
  };
}

export function buildGroupIdsByMember(rows: { group_id: string; member_user_id: string }[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    (result[row.member_user_id] ??= []).push(row.group_id);
  }
  return result;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run tests/account/connection-groups.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/domain/account/connection-groups.ts tests/account/connection-groups.test.ts
git commit -m "feat(connections): グループのドメイン（色・上限・名前の検証・変換）を足す"
```

---

### Task 7: グループの Server Action

**Files:**
- Create: `lib/actions/account/connection-groups.ts`
- Test: `tests/account/actions/connection-groups.test.ts`

**Interfaces:**
- Consumes: Task 6 のドメイン、Task 1〜2 の RPC
- Produces:
  - `type CreateConnectionGroupResult = { status: "success"; groupId: string } | { status: "error"; message: string }`
  - `createConnectionGroupAction(input: { name: string; color: string; memberIds?: string[] }): Promise<CreateConnectionGroupResult>`
  - `updateConnectionGroupAction(groupId: string, input: { name: string; color: string }): Promise<ActionState>`
  - `deleteConnectionGroupAction(groupId: string): Promise<ActionState>`（成功時は `/connections` へ `redirect`）
  - `addConnectionGroupMembersAction(groupId: string, memberIds: string[]): Promise<ActionState>`
  - `removeConnectionGroupMemberAction(groupId: string, memberId: string): Promise<ActionState>`
  - `setPersonConnectionGroupsAction(memberId: string, groupIds: string[]): Promise<ActionState>`
  - `loadConnectionGroupCandidatesAction(groupId: string): Promise<ConnectionGroupMember[]>`

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/actions/connection-groups.test.ts`（モックは `tests/account/actions/connections.test.ts:1-23` と同じ形）:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentActiveUser, revalidatePath, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT;${path}`);
  })
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("NEXT_REDIRECT")) throw cause;
  }
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentActiveUser }));

import {
  addConnectionGroupMembersAction,
  createConnectionGroupAction,
  deleteConnectionGroupAction,
  loadConnectionGroupCandidatesAction,
  removeConnectionGroupMemberAction,
  setPersonConnectionGroupsAction,
  updateConnectionGroupAction
} from "@/lib/actions/account/connection-groups";

const me = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const aya = "33333333-3333-4333-8333-333333333333";

function mockRpc(result: { data?: unknown; error: { code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error });
  createSupabaseServerClient.mockResolvedValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentActiveUser.mockResolvedValue({ id: me });
});

describe("createConnectionGroupAction", () => {
  it("名前を整えて RPC に渡し、作ったグループの ID を返す", async () => {
    const rpc = mockRpc({ data: groupId, error: null });

    const result = await createConnectionGroupAction({ name: " 謎解き仲間 ", color: "nazotoki", memberIds: [aya] });

    expect(result).toEqual({ status: "success", groupId });
    expect(rpc).toHaveBeenCalledWith("create_connection_group", {
      p_name: "謎解き仲間",
      p_color: "nazotoki",
      p_member_ids: [aya]
    });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("名前が空なら RPC を呼ばずに理由を返す", async () => {
    const rpc = mockRpc({ error: null });
    const result = await createConnectionGroupAction({ name: " ", color: "nazotoki" });
    expect(result).toEqual({ status: "error", message: "グループ名を入力してください" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("知らない色や UUID でないメンバーは RPC を呼ばずに弾く", async () => {
    const rpc = mockRpc({ error: null });
    expect((await createConnectionGroupAction({ name: "A", color: "black" })).status).toBe("error");
    expect((await createConnectionGroupAction({ name: "A", color: "nazotoki", memberIds: ["x"] })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PSP02", "操作が多すぎます。しばらく待ってから再度お試しください。"],
    ["PSP05", "グループは20個までです"],
    ["PSP06", "1つのグループに入れられるのは30人までです"],
    ["PSP07", "同じ名前のグループがあります"],
    ["PSP08", "一緒に参加したことがある人か、フォロー中の人だけを入れられます"]
  ])("%s を日本語の理由にする", async (code, message) => {
    mockRpc({ error: { code } });
    expect(await createConnectionGroupAction({ name: "A", color: "nazotoki" })).toEqual({ status: "error", message });
  });
});

describe("updateConnectionGroupAction", () => {
  it("名前と色を渡し、つながり画面とグループ画面を再検証する", async () => {
    const rpc = mockRpc({ error: null });
    const result = await updateConnectionGroupAction(groupId, { name: "謎解き部", color: "honey" });
    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("update_connection_group", { p_group_id: groupId, p_name: "謎解き部", p_color: "honey" });
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
    expect(revalidatePath).toHaveBeenCalledWith(`/connections/groups/${groupId}`);
  });

  it("PSP09 は見つからない旨を返す", async () => {
    mockRpc({ error: { code: "PSP09" } });
    expect(await updateConnectionGroupAction(groupId, { name: "A", color: "nazotoki" })).toEqual({
      status: "error",
      message: "グループが見つかりません"
    });
  });
});

describe("deleteConnectionGroupAction", () => {
  it("消したらつながり画面へ戻す", async () => {
    const rpc = mockRpc({ error: null });
    await expect(deleteConnectionGroupAction(groupId)).rejects.toThrow("NEXT_REDIRECT;/connections");
    expect(rpc).toHaveBeenCalledWith("delete_connection_group", { p_group_id: groupId });
  });

  it("UUID でない ID は RPC を呼ばない", async () => {
    const rpc = mockRpc({ error: null });
    expect((await deleteConnectionGroupAction("x")).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("メンバー操作", () => {
  it("追加・削除・人ごとの設定がそれぞれの RPC を呼ぶ", async () => {
    const rpc = mockRpc({ error: null });
    await addConnectionGroupMembersAction(groupId, [aya]);
    await removeConnectionGroupMemberAction(groupId, aya);
    await setPersonConnectionGroupsAction(aya, [groupId]);
    expect(rpc).toHaveBeenNthCalledWith(1, "add_connection_group_members", { p_group_id: groupId, p_member_ids: [aya] });
    expect(rpc).toHaveBeenNthCalledWith(2, "remove_connection_group_member", { p_group_id: groupId, p_member_id: aya });
    expect(rpc).toHaveBeenNthCalledWith(3, "set_person_connection_groups", { p_member_id: aya, p_group_ids: [groupId] });
  });

  it("候補を読み込んで変換する", async () => {
    mockRpc({ data: [{ user_id: aya, display_name: "あや", shared_event_count: "2", is_following: false }], error: null });
    expect(await loadConnectionGroupCandidatesAction(groupId)).toEqual([
      { userId: aya, displayName: "あや", sharedEventCount: 2, isFollowing: false }
    ]);
  });

  it("ログインしていなければログイン画面へ", async () => {
    getCurrentActiveUser.mockResolvedValue(null);
    mockRpc({ error: null });
    await expect(addConnectionGroupMembersAction(groupId, [aya])).rejects.toThrow("NEXT_REDIRECT;/login");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account/actions/connection-groups.test.ts`
Expected: FAIL（モジュールがない）

- [ ] **Step 3: 実装する**

`lib/actions/account/connection-groups.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { errorState, successState, type ActionState } from "@/lib/domain/shared/action-state";
import {
  isConnectionGroupColor,
  isUuid,
  mapConnectionGroupMemberRow,
  normalizeConnectionGroupName,
  type ConnectionGroupMember
} from "@/lib/domain/account/connection-groups";
import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

const groupErrorMessages: Record<string, string> = {
  PSP02: "操作が多すぎます。しばらく待ってから再度お試しください。",
  PSP05: "グループは20個までです",
  PSP06: "1つのグループに入れられるのは30人までです",
  PSP07: "同じ名前のグループがあります",
  PSP08: "一緒に参加したことがある人か、フォロー中の人だけを入れられます",
  PSP09: "グループが見つかりません",
  PSP10: "グループ名は1〜20文字で、色は選択肢から選んでください"
};

export type CreateConnectionGroupResult = { status: "success"; groupId: string } | { status: "error"; message: string };

async function requireUser() {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

function messageFor(code: string | undefined, fallback: string) {
  return (code && groupErrorMessages[code]) || fallback;
}

function revalidateGroup(groupId?: string) {
  revalidatePath("/connections");
  if (groupId) revalidatePath(`/connections/groups/${groupId}`);
}

function validIds(ids: string[]) {
  return ids.every(isUuid);
}

export async function createConnectionGroupAction(input: {
  name: string;
  color: string;
  memberIds?: string[];
}): Promise<CreateConnectionGroupResult> {
  try {
    await requireUser();
    const name = normalizeConnectionGroupName(input.name);
    if (!name.ok) return { status: "error", message: name.message };
    if (!isConnectionGroupColor(input.color)) return { status: "error", message: groupErrorMessages.PSP10 };
    const memberIds = input.memberIds ?? [];
    if (!validIds(memberIds)) return { status: "error", message: "メンバーの指定が正しくありません" };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_connection_group", {
      p_name: name.name,
      p_color: input.color,
      p_member_ids: memberIds
    });
    if (error || typeof data !== "string") {
      return { status: "error", message: messageFor(error?.code, "グループを作れませんでした") };
    }

    revalidateGroup();
    return { status: "success", groupId: data };
  } catch (cause) {
    unstable_rethrow(cause);
    return { status: "error", message: "グループを作れませんでした" };
  }
}

export async function updateConnectionGroupAction(
  groupId: string,
  input: { name: string; color: string }
): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId)) return errorState(groupErrorMessages.PSP09);
    const name = normalizeConnectionGroupName(input.name);
    if (!name.ok) return errorState(name.message);
    if (!isConnectionGroupColor(input.color)) return errorState(groupErrorMessages.PSP10);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("update_connection_group", {
      p_group_id: groupId,
      p_name: name.name,
      p_color: input.color
    });
    if (error) return errorState(messageFor(error.code, "グループを保存できませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを保存できませんでした");
  }
}

export async function deleteConnectionGroupAction(groupId: string): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId)) return errorState(groupErrorMessages.PSP09);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_connection_group", { p_group_id: groupId });
    if (error) return errorState(messageFor(error.code, "グループを削除できませんでした"));

    revalidateGroup(groupId);
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを削除できませんでした");
  }
  redirect("/connections");
}

export async function addConnectionGroupMembersAction(groupId: string, memberIds: string[]): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId) || !validIds(memberIds)) return errorState("メンバーの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("add_connection_group_members", { p_group_id: groupId, p_member_ids: memberIds });
    if (error) return errorState(messageFor(error.code, "メンバーを追加できませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("メンバーを追加できませんでした");
  }
}

export async function removeConnectionGroupMemberAction(groupId: string, memberId: string): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(groupId) || !isUuid(memberId)) return errorState("メンバーの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("remove_connection_group_member", { p_group_id: groupId, p_member_id: memberId });
    if (error) return errorState(messageFor(error.code, "メンバーを外せませんでした"));

    revalidateGroup(groupId);
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("メンバーを外せませんでした");
  }
}

export async function setPersonConnectionGroupsAction(memberId: string, groupIds: string[]): Promise<ActionState> {
  try {
    await requireUser();
    if (!isUuid(memberId) || !validIds(groupIds)) return errorState("グループの指定が正しくありません");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_person_connection_groups", { p_member_id: memberId, p_group_ids: groupIds });
    if (error) return errorState(messageFor(error.code, "グループを保存できませんでした"));

    revalidateGroup();
    return successState();
  } catch (cause) {
    unstable_rethrow(cause);
    return errorState("グループを保存できませんでした");
  }
}

export async function loadConnectionGroupCandidatesAction(groupId: string): Promise<ConnectionGroupMember[]> {
  await requireUser();
  if (!isUuid(groupId)) throw new Error(groupErrorMessages.PSP09);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_connection_group_candidates", { p_group_id: groupId });
  if (error) throw new Error("候補を読み込めませんでした");

  return (data ?? []).map(mapConnectionGroupMemberRow);
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run tests/account/actions/connection-groups.test.ts && npx tsc --noEmit`
Expected: PASS、型エラーなし

- [ ] **Step 5: コミット**

```bash
git add lib/actions/account/connection-groups.ts tests/account/actions/connection-groups.test.ts
git commit -m "feat(connections): グループの Server Action を足す"
```

---

### Task 8: つながり画面（グループの欄・人の行・お気に入りの撤去）

**Files:**
- Create: `components/account/connection-group-color-field.tsx`
- Create: `components/account/connection-groups-section.tsx`
- Create: `components/account/connection-group-picker.tsx`
- Modify: `components/account/connection-list.tsx`
- Modify: `app/connections/page.tsx`
- Modify: `components/event/event-invite-candidates.tsx:91-96`
- Test: `tests/account/connection-groups-section.test.tsx`（新規）、`tests/account/connection-list.test.tsx`（変更）、`tests/account/connections-page-performance.test.ts`（変更）、`tests/event/event-invite-candidates.test.tsx`（変更）

**Interfaces:**
- Consumes: Task 6 のドメイン、Task 7 の Action
- Produces:
  - `ConnectionGroupColorField({ name, value, onChange }: { name: string; value: ConnectionGroupColor; onChange: (color: ConnectionGroupColor) => void })`
  - `ConnectionGroupsSection({ groups }: { groups: ConnectionGroup[] })`
  - `ConnectionGroupPicker({ person, groups, selectedGroupIds, onClose }: { person: { userId: string; displayName: string }; groups: ConnectionGroup[]; selectedGroupIds: string[]; onClose: () => void })`
  - `ConnectionList` の props: `{ mutualFollows?, following, candidates, blockedUsers?, groups: ConnectionGroup[], groupIdsByMember: Record<string, string[]> }`（`favorites` は削除）

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/connection-groups-section.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createConnectionGroupAction, push } = vi.hoisted(() => ({
  createConnectionGroupAction: vi.fn(),
  push: vi.fn()
}));

vi.mock("@/lib/actions/account/connection-groups", () => ({ createConnectionGroupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), unstable_rethrow: vi.fn() }));

import { ConnectionGroupsSection } from "@/components/account/connection-groups-section";
import type { ConnectionGroup } from "@/lib/domain/account/connection-groups";

const nazotoki: ConnectionGroup = {
  id: "g1",
  name: "謎解き仲間",
  color: "nazotoki",
  memberCount: 7,
  memberNames: ["あや", "けん", "みお", "たく", "ゆい"],
  activeEventCount: 2
};

beforeEach(() => vi.clearAllMocks());

describe("ConnectionGroupsSection", () => {
  it("グループを、名前・人数・メンバー名・進めているイベントの件数つきのリンクで並べる", () => {
    render(<ConnectionGroupsSection groups={[nazotoki]} />);
    const link = screen.getByRole("link", { name: /謎解き仲間/ });
    expect(link).toHaveAttribute("href", "/connections/groups/g1");
    expect(link).toHaveTextContent("7人");
    expect(link).toHaveTextContent("あや・けん・みお・たく・ゆい ほか2人");
    expect(link).toHaveTextContent("進めているイベント 2件");
    expect(screen.getByText("自分だけに見えます")).toBeInTheDocument();
  });

  it("0件のときは説明と作るボタンだけ出す", () => {
    render(<ConnectionGroupsSection groups={[]} />);
    expect(screen.getByText("よく誘う仲間をまとめておくと、招待のときにまとめて選べます。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "＋ グループを作る" })).toBeEnabled();
  });

  it("作ったらそのグループの画面へ進む", async () => {
    createConnectionGroupAction.mockResolvedValue({ status: "success", groupId: "g9" });
    render(<ConnectionGroupsSection groups={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ グループを作る" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "大学の友達" } });
    fireEvent.click(screen.getByRole("radio", { name: "みどり" }));
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/connections/groups/g9"));
    expect(createConnectionGroupAction).toHaveBeenCalledWith({ name: "大学の友達", color: "boardgame" });
  });

  it("失敗したら理由を出す", async () => {
    createConnectionGroupAction.mockResolvedValue({ status: "error", message: "同じ名前のグループがあります" });
    render(<ConnectionGroupsSection groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ グループを作る" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "謎解き仲間" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("同じ名前のグループがあります");
  });

  it("20個に達したら作るボタンを押せず、理由を出す", () => {
    const groups = Array.from({ length: 20 }, (_, i) => ({ ...nazotoki, id: `g${i}`, name: `G${i}` }));
    render(<ConnectionGroupsSection groups={groups} />);
    expect(screen.getByRole("button", { name: "＋ グループを作る" })).toBeDisabled();
    expect(screen.getByText("グループは20個までです")).toBeInTheDocument();
  });
});
```

`tests/account/connection-list.test.tsx` の変更:
- `vi.mock("@/lib/actions/account/connections", ...)` から `toggleFavoriteAction` を消し、`vi.mock("@/lib/actions/account/connection-groups", () => ({ setPersonConnectionGroupsAction, createConnectionGroupAction }))` を足す（`vi.hoisted` で `vi.fn()` を用意）
- `ConnectionList` を描く箇所の `favorites={...}` をすべて消し、`groups={[]}` と `groupIdsByMember={{}}` を渡す
- お気に入りのタブ・ボタンを前提にしたテストは、下の新しいテストに置き換える（お気に入りの挙動を確かめていたテストは、機能ごとなくなるので削除する）。ブロック確認とブロック中の行の旧文言（「お互いのフォローとお気に入りも解除されます。」「解除しても、以前のフォローやお気に入りは戻りません。」）を確かめている箇所は、新しい文言に合わせる
- 次のテストを足す:

```tsx
describe("お気に入りの撤去とグループ", () => {
  const groups = [
    { id: "g1", name: "謎解き仲間", color: "nazotoki" as const, memberCount: 1, memberNames: ["あきらさん"], activeEventCount: 0 },
    { id: "g2", name: "大学の友達", color: "boardgame" as const, memberCount: 0, memberNames: [], activeEventCount: 0 }
  ];

  it("タブは 一緒に参加／フォロー中／相互フォロー／ブロック中 の順で、お気に入りは出さない", () => {
    render(
      <ConnectionList
        mutualFollows={tabData([favorite])}
        following={tabData([following])}
        candidates={tabData([candidate])}
        blockedUsers={emptyBlocked}
        groups={groups}
        groupIdsByMember={{}}
      />
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+件?/g, "").trim())).toEqual([
      "一緒に参加",
      "フォロー中",
      "相互フォロー",
      "ブロック中"
    ]);
    expect(screen.queryByText(/お気に入り/)).not.toBeInTheDocument();
    expect(screen.queryByText("つながりの使い分け")).not.toBeInTheDocument();
  });

  it("人の行に所属グループを出し、「グループに入れる」で選んで保存できる", async () => {
    setPersonConnectionGroupsAction.mockResolvedValue({ status: "success" });
    render(
      <ConnectionList
        following={empty}
        candidates={tabData([candidate])}
        groups={groups}
        groupIdsByMember={{ [candidate.userId]: ["g1"] }}
      />
    );

    expect(screen.getByText("謎解き仲間")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
    const dialog = screen.getByRole("group", { name: `${candidate.displayName}を入れるグループ` });
    expect(within(dialog).getByRole("checkbox", { name: "謎解き仲間" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "大学の友達" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "保存する" }));

    await waitFor(() =>
      expect(setPersonConnectionGroupsAction).toHaveBeenCalledWith(candidate.userId, ["g1", "g2"])
    );
  });

  it("パネルの中で新しいグループを作って、その人を入れられる", async () => {
    createConnectionGroupAction.mockResolvedValue({ status: "success", groupId: "g9" });
    render(<ConnectionList following={empty} candidates={tabData([candidate])} groups={[]} groupIdsByMember={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
    fireEvent.change(screen.getByLabelText("新しいグループを作って入れる"), { target: { value: "謎解き仲間" } });
    fireEvent.click(screen.getByRole("button", { name: "作って入れる" }));
    await waitFor(() =>
      expect(createConnectionGroupAction).toHaveBeenCalledWith({
        name: "謎解き仲間",
        color: "nazotoki",
        memberIds: [candidate.userId]
      })
    );
  });

  it("30人に達したグループは、まだ入っていない人には選べない", () => {
    render(
      <ConnectionList
        following={empty}
        candidates={tabData([candidate])}
        groups={[{ ...groups[1], memberCount: 30 }]}
        groupIdsByMember={{}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "グループに入れる" }));
    expect(screen.getByRole("checkbox", { name: "大学の友達" })).toBeDisabled();
    expect(screen.getByText("30人まで")).toBeInTheDocument();
  });

  it("ブロックの確認に、グループからも外れることを書く", () => {
    render(<ConnectionList following={empty} candidates={tabData([candidate])} groups={[]} groupIdsByMember={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "ブロック" }));
    expect(screen.getByText("お互いのフォローが解除され、グループからも外れます。")).toBeInTheDocument();
  });
});
```

（`within` は `@testing-library/react` から import に足す）

`tests/account/connections-page-performance.test.ts` に足す:

```ts
  it("お気に入りの一覧は読み込まず、グループは RPC 2本で読む", () => {
    const source = readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");
    expect(source).not.toContain('p_category: "favorites"');
    expect(source).toContain('supabase.rpc("list_connection_groups")');
    expect(source).toContain('supabase.rpc("list_connection_group_memberships")');
  });
```

`tests/event/event-invite-candidates.test.tsx` に足す（既存の描画ヘルパーを使う。候補は `sharedEventCount: 0, isFollowing: true, isFavorite: true`）:

```tsx
  it("お気に入りの人も「フォロー中」と表示する", () => {
    // 既存テストと同じ props の組み立てで、上の候補1人を渡して描く
    expect(screen.getByText("フォロー中")).toBeInTheDocument();
    expect(screen.queryByText("お気に入り")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account tests/event/event-invite-candidates.test.tsx`
Expected: FAIL（新しいコンポーネントがない、お気に入りのタブが出ている、など）

- [ ] **Step 3: 色の選択欄を作る**

`components/account/connection-group-color-field.tsx`:

```tsx
"use client";

import React from "react";
import { clsx } from "clsx";

import {
  connectionGroupColorLabels,
  connectionGroupColors,
  connectionGroupDotClass,
  type ConnectionGroupColor
} from "@/lib/domain/account/connection-groups";

export function ConnectionGroupColorField({
  name,
  value,
  onChange
}: {
  name: string;
  value: ConnectionGroupColor;
  onChange: (color: ConnectionGroupColor) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-body font-bold text-ink">色</legend>
      <div className="flex flex-wrap gap-2">
        {connectionGroupColors.map((color) => (
          <label
            key={color}
            className={clsx(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2",
              value === color ? "border-pine bg-mist text-pine" : "border-line-strong bg-surface text-ink hover:border-moss"
            )}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="sr-only"
            />
            <span aria-hidden="true" className={clsx("h-3 w-3 rounded-full", connectionGroupDotClass[color])} />
            {connectionGroupColorLabels[color]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: グループの欄を作る**

`components/account/connection-groups-section.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState, useTransition } from "react";
import { clsx } from "clsx";

import { ConnectionGroupColorField } from "@/components/account/connection-group-color-field";
import { createConnectionGroupAction } from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  defaultConnectionGroupColor,
  type ConnectionGroup,
  type ConnectionGroupColor
} from "@/lib/domain/account/connection-groups";

function memberSummary(group: ConnectionGroup) {
  if (group.memberCount === 0) return "まだメンバーがいません";
  const rest = group.memberCount - group.memberNames.length;
  return `${group.memberNames.join("・")}${rest > 0 ? ` ほか${rest}人` : ""}`;
}

export function ConnectionGroupsSection({ groups }: { groups: ConnectionGroup[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ConnectionGroupColor>(defaultConnectionGroupColor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isFull = groups.length >= connectionGroupLimits.groups;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createConnectionGroupAction({ name, color });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push(`/connections/groups/${result.groupId}`);
    });
  }

  return (
    <section aria-labelledby="connection-groups-heading" className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id="connection-groups-heading" className="text-xl font-semibold text-ink">
          グループ
        </h2>
        <span className="text-caption text-muted">自分だけに見えます</span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">よく誘う仲間をまとめておくと、招待のときにまとめて選べます。</p>
      ) : (
        <ul className="grid gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/connections/groups/${group.id}`}
                className="grid gap-1 rounded-control border border-line bg-surface p-3 transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                <span className="flex items-center gap-2 font-bold text-ink">
                  <span aria-hidden="true" className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", connectionGroupDotClass[group.color])} />
                  <span className="min-w-0 truncate">{group.name}</span>
                  <span className="ml-auto whitespace-nowrap text-caption font-normal text-muted">{group.memberCount}人</span>
                </span>
                <span className="truncate text-caption text-muted">{memberSummary(group)}</span>
                <span className="text-caption text-muted">進めているイベント {group.activeEventCount}件</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isCreating ? (
        <form onSubmit={submit} className="grid gap-3 rounded-control border border-line bg-surface p-3">
          <label className="grid gap-1" htmlFor="new-connection-group-name">
            <span className="text-body font-bold text-ink">グループ名</span>
            <input
              id="new-connection-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={connectionGroupLimits.nameLength}
              required
              aria-describedby={error ? "new-connection-group-error" : undefined}
              className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </label>
          <ConnectionGroupColorField name="new-connection-group-color" value={color} onChange={setColor} />
          {error ? (
            <p id="new-connection-group-error" role="alert" className="text-sm font-semibold text-clay-ink">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
            >
              作成する
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              やめる
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-1">
          <button
            type="button"
            disabled={isFull}
            onClick={() => setIsCreating(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-dashed border-moss px-4 py-2 text-sm font-bold text-pine transition-colors hover:bg-mist focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ＋ グループを作る
          </button>
          {isFull ? <p className="text-caption text-muted">グループは20個までです</p> : null}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: 「グループに入れる」パネルを作る**

`components/account/connection-group-picker.tsx`:

```tsx
"use client";

import React, { useState, useTransition } from "react";
import { clsx } from "clsx";

import { createConnectionGroupAction, setPersonConnectionGroupsAction } from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  defaultConnectionGroupColor,
  type ConnectionGroup
} from "@/lib/domain/account/connection-groups";

export function ConnectionGroupPicker({
  person,
  groups,
  selectedGroupIds,
  onClose
}: {
  person: { userId: string; displayName: string };
  groups: ConnectionGroup[];
  selectedGroupIds: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(selectedGroupIds);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canCreateGroup = groups.length < connectionGroupLimits.groups;

  function createAndAdd() {
    setError(null);
    startTransition(async () => {
      // 色は既定色。あとからグループ画面で変えられる。
      const result = await createConnectionGroupAction({
        name: newGroupName,
        color: defaultConnectionGroupColor,
        memberIds: [person.userId]
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onClose();
    });
  }

  function toggle(groupId: string) {
    setSelected((current) => (current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setPersonConnectionGroupsAction(person.userId, selected);
      if (result.status === "error") {
        setError(result.message ?? "グループを保存できませんでした");
        return;
      }
      onClose();
    });
  }

  return (
    <div role="group" aria-label={`${person.displayName}を入れるグループ`} className="mt-3 grid gap-2 rounded-control border border-line bg-sunken p-3">
      {groups.length === 0 ? (
        <p className="text-sm text-muted">まだグループがありません。下で作れます。</p>
      ) : (
        <ul className="grid gap-1">
          {groups.map((group) => {
            const wasMember = selectedGroupIds.includes(group.id);
            const isFull = !wasMember && group.memberCount >= connectionGroupLimits.members;
            return (
              <li key={group.id}>
                <label className={clsx("flex min-h-11 items-center gap-2 text-sm", isFull ? "text-muted" : "text-ink")}>
                  <input
                    type="checkbox"
                    checked={selected.includes(group.id)}
                    disabled={isFull}
                    onChange={() => toggle(group.id)}
                    className="h-5 w-5 shrink-0 accent-moss"
                  />
                  <span aria-hidden="true" className={clsx("h-2.5 w-2.5 rounded-full", connectionGroupDotClass[group.color])} />
                  <span>{group.name}</span>
                  {isFull ? <span className="ml-auto text-caption">30人まで</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {canCreateGroup ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1" htmlFor={`new-group-for-${person.userId}`}>
            <span className="text-caption font-bold text-ink">新しいグループを作って入れる</span>
            <input
              id={`new-group-for-${person.userId}`}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              maxLength={connectionGroupLimits.nameLength}
              placeholder="グループ名"
              className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </label>
          <button
            type="button"
            disabled={isPending || newGroupName.trim().length === 0}
            onClick={createAndAdd}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-moss px-4 py-2 text-sm font-bold text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
          >
            作って入れる
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-clay-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {groups.length > 0 ? (
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
          >
            保存する
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `connection-list.tsx` を変える**

1. import から `Heart`、`toggleFavoriteAction` を消し、`FolderPlus`（lucide-react）と `ConnectionGroupPicker`、`connectionGroupDotClass`、`type ConnectionGroup` を足す
2. `ConnectionListProps` から `favorites` を消し、`groups: ConnectionGroup[]` と `groupIdsByMember: Record<string, string[]>` を足す。`TabItems`・`items` と `cursors` の初期値・`ConnectionTabId` から `favorites` を除く（`type ConnectionTabId = Exclude<ConnectionCategory, "favorites">`）
3. `tabs` 配列からお気に入りの要素を消し、並びを `shared`（一緒に参加）→ `following`（フォロー中）→ `mutual`（相互フォロー）→ `blocked`（ブロック中）にする。`loadMore` の型は `ConnectionTabId` のまま
4. 「つながりの使い分け」の `<section aria-labelledby="connection-guide-title">` を丸ごと消す
5. タブの中の行を描く箇所で `ConnectionRow` に `groups={groups}` と `groupIds={groupIdsByMember[person.userId] ?? []}` を渡す
6. `ConnectionRow` の props に `groups: ConnectionGroup[]; groupIds: string[]` を足し、`const [isPickingGroups, setIsPickingGroups] = useState(false);` を持つ。名前の下（`共通のイベント` の行の次）に所属グループを出す:

```tsx
          {groupIds.length > 0 ? (
            <ul aria-label="所属グループ" className="mt-2 flex flex-wrap gap-1.5">
              {groups
                .filter((group) => groupIds.includes(group.id))
                .map((group) => (
                  <li key={group.id} className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-0.5 text-caption font-bold text-muted">
                    <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", connectionGroupDotClass[group.color])} />
                    {group.name}
                  </li>
                ))}
            </ul>
          ) : null}
```

7. お気に入りの `ActionButton` を消し、フォローのボタンの前に次を置く:

```tsx
          <ActionButton
            label="グループに入れる"
            icon={FolderPlus}
            disabled={isPending}
            active={isPickingGroups}
            onClick={() => setIsPickingGroups((open) => !open)}
          />
```

8. ブロック確認の直前に `{isPickingGroups ? <ConnectionGroupPicker person={person} groups={groups} selectedGroupIds={groupIds} onClose={() => setIsPickingGroups(false)} /> : null}` を置く
9. ブロック確認の説明を「お互いのフォローが解除され、グループからも外れます。」に、ブロック中の行の説明を「解除しても、以前のフォローやグループは戻りません。」に変える
10. `clsx` を使っていなければ `import { clsx } from "clsx";` を足す

- [ ] **Step 7: つながり画面を変える**

`app/connections/page.tsx`:
- `PageHeader` の `description` を「よく遊ぶ仲間をグループにまとめて、次のイベントにまとめて誘えます。」にする
- `loadConnectionsOverview` から `favoritesResult`（`p_category: "favorites"` の呼び出し）と戻り値の `favorites` を消す
- 次の関数を足し、`Promise.all` に加える:

```ts
async function loadConnectionGroups(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const [groupsResult, membershipsResult] = await Promise.all([
    supabase.rpc("list_connection_groups"),
    supabase.rpc("list_connection_group_memberships")
  ]);

  if (groupsResult.error || membershipsResult.error) {
    throw new Error("グループを読み込めませんでした。");
  }

  return {
    groups: (groupsResult.data ?? []).map(mapConnectionGroupRow),
    groupIdsByMember: buildGroupIdsByMember(membershipsResult.data ?? [])
  };
}
```

- 描画を次の並びにする（PC ではグループを左の列、人を右の列）:

```tsx
    <div className="space-y-6">
      <PageHeader eyebrow="Connections" title="つながり" description="よく遊ぶ仲間をグループにまとめて、次のイベントにまとめて誘えます。" />
      <ReceivedEventInvitations invitations={invitations} />
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <ConnectionGroupsSection groups={groupData.groups} />
        <section aria-labelledby="connection-people-heading" className="grid gap-3">
          <h2 id="connection-people-heading" className="text-xl font-semibold text-ink">人</h2>
          <ConnectionList
            mutualFollows={{ ...overview.mutual, totalCount: overview.counts.mutual }}
            following={{ ...overview.following, totalCount: overview.counts.following }}
            candidates={{ ...overview.shared, totalCount: overview.counts.shared }}
            blockedUsers={{
              items: overview.blocked.items.map(toBlockedUser),
              nextCursor: overview.blocked.nextCursor,
              totalCount: overview.counts.blocked
            }}
            groups={groupData.groups}
            groupIdsByMember={groupData.groupIdsByMember}
          />
        </section>
      </div>
    </div>
```

- [ ] **Step 8: 招待候補の説明を変える**

`components/event/event-invite-candidates.tsx:91-96` の三項演算子を次にする:

```tsx
                  {candidate.sharedEventCount > 0 ? `一緒だったイベント ${candidate.sharedEventCount}件` : "フォロー中"}
```

- [ ] **Step 9: 通ることを確認する**

Run: `npx vitest run tests/account tests/event/event-invite-candidates.test.tsx && npx tsc --noEmit && npx eslint app/connections components/account components/event/event-invite-candidates.tsx lib/domain/account lib/actions/account`
Expected: PASS、型エラー・lint エラーなし

- [ ] **Step 10: コミット**

```bash
git add components/account app/connections/page.tsx components/event/event-invite-candidates.tsx tests/account tests/event/event-invite-candidates.test.tsx
git commit -m "feat(connections): つながり画面をグループが主役の構成にし、お気に入りをなくす"
```

---

### Task 9: グループ画面（メンバーの一覧と編集）

**Files:**
- Create: `app/connections/groups/[groupId]/page.tsx`
- Create: `components/account/connection-group-detail.tsx`
- Test: `tests/account/connection-group-detail.test.tsx`（新規）、`tests/account/connection-group-page.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 6 のドメイン、Task 7 の Action、`ConnectionGroupColorField`
- Produces: `ConnectionGroupDetail({ group, members }: { group: ConnectionGroup; members: ConnectionGroupMember[] })`

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/connection-group-detail.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  updateConnectionGroupAction: vi.fn(),
  deleteConnectionGroupAction: vi.fn(),
  addConnectionGroupMembersAction: vi.fn(),
  removeConnectionGroupMemberAction: vi.fn(),
  loadConnectionGroupCandidatesAction: vi.fn()
}));

vi.mock("@/lib/actions/account/connection-groups", () => actions);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { ConnectionGroupDetail } from "@/components/account/connection-group-detail";
import type { ConnectionGroup, ConnectionGroupMember } from "@/lib/domain/account/connection-groups";

const group: ConnectionGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "謎解き仲間",
  color: "nazotoki",
  memberCount: 1,
  memberNames: ["あや"],
  activeEventCount: 0
};
const aya: ConnectionGroupMember = {
  userId: "22222222-2222-4222-8222-222222222222",
  displayName: "あや",
  sharedEventCount: 3,
  isFollowing: true
};
const ken: ConnectionGroupMember = { ...aya, userId: "33333333-3333-4333-8333-333333333333", displayName: "けん" };

beforeEach(() => vi.clearAllMocks());

describe("ConnectionGroupDetail", () => {
  it("名前・人数・メンバーを出す", () => {
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    expect(screen.getByRole("heading", { level: 1, name: "謎解き仲間" })).toBeInTheDocument();
    expect(screen.getByText("1人")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "メンバー" })).toHaveTextContent("あや");
  });

  it("名前と色を変えられる", async () => {
    actions.updateConnectionGroupAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "名前と色を変える" }));
    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "謎解き部" } });
    fireEvent.click(screen.getByRole("radio", { name: "こがね" }));
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await waitFor(() =>
      expect(actions.updateConnectionGroupAction).toHaveBeenCalledWith(group.id, { name: "謎解き部", color: "honey" })
    );
  });

  it("削除は画面内で確認してから行う", async () => {
    actions.deleteConnectionGroupAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "グループを削除" }));
    expect(screen.getByText("「謎解き仲間」を削除しますか？ メンバーとのつながりはそのまま残ります。")).toBeInTheDocument();
    expect(actions.deleteConnectionGroupAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(actions.deleteConnectionGroupAction).toHaveBeenCalledWith(group.id));
  });

  it("メンバーを外せる", async () => {
    actions.removeConnectionGroupMemberAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "あやをグループから外す" }));
    await waitFor(() => expect(actions.removeConnectionGroupMemberAction).toHaveBeenCalledWith(group.id, aya.userId));
  });

  it("候補を読み込んで、選んだ人を追加できる", async () => {
    actions.loadConnectionGroupCandidatesAction.mockResolvedValue([ken]);
    actions.addConnectionGroupMembersAction.mockResolvedValue({ status: "success" });
    render(<ConnectionGroupDetail group={group} members={[aya]} />);

    fireEvent.click(screen.getByRole("button", { name: "メンバーを追加" }));
    const picker = await screen.findByRole("group", { name: "追加する人" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "けん" }));
    fireEvent.click(within(picker).getByRole("button", { name: "1人を追加" }));

    await waitFor(() => expect(actions.addConnectionGroupMembersAction).toHaveBeenCalledWith(group.id, [ken.userId]));
  });

  it("30人に達していたら追加ボタンを押せず、理由を出す", () => {
    render(<ConnectionGroupDetail group={{ ...group, memberCount: 30 }} members={[aya]} />);
    expect(screen.getByRole("button", { name: "メンバーを追加" })).toBeDisabled();
    expect(screen.getByText("1つのグループに入れられるのは30人までです")).toBeInTheDocument();
  });

  it("追加できる人数を超えては選べない", async () => {
    const candidates = [ken, { ...ken, userId: "44444444-4444-4444-8444-444444444444", displayName: "みお" }];
    actions.loadConnectionGroupCandidatesAction.mockResolvedValue(candidates);
    render(<ConnectionGroupDetail group={{ ...group, memberCount: 29 }} members={[aya]} />);
    fireEvent.click(screen.getByRole("button", { name: "メンバーを追加" }));
    const picker = await screen.findByRole("group", { name: "追加する人" });
    fireEvent.click(within(picker).getByRole("checkbox", { name: "けん" }));
    expect(within(picker).getByRole("checkbox", { name: "みお" })).toBeDisabled();
  });
});
```

`tests/account/connection-group-page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUserId, notFound, redirect } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT;${path}`);
  })
}));

vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUserId, hasSupabaseEnv: () => true }));
vi.mock("@/components/account/connection-group-detail", () => ({ ConnectionGroupDetail: () => null }));

import ConnectionGroupPage from "@/app/connections/groups/[groupId]/page";

const groupId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue("22222222-2222-4222-8222-222222222222");
});

describe("ConnectionGroupPage", () => {
  it("UUID でない ID は RPC を呼ばずに404", async () => {
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId: "x" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("自分のグループでなければ（RPC が空なら）404", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("未ログインはログイン画面へ", async () => {
    getCurrentUserId.mockResolvedValue(null);
    await expect(ConnectionGroupPage({ params: Promise.resolve({ groupId }) })).rejects.toThrow(
      `NEXT_REDIRECT;/login?next=%2Fconnections%2Fgroups%2F${groupId}`
    );
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account/connection-group-detail.test.tsx tests/account/connection-group-page.test.tsx`
Expected: FAIL（モジュールがない）

- [ ] **Step 3: ページを作る**

`app/connections/groups/[groupId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";

import { ConnectionGroupDetail } from "@/components/account/connection-group-detail";
import { isUuid, mapConnectionGroupMemberRow, mapConnectionGroupRow } from "@/lib/domain/account/connection-groups";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ConnectionGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!isUuid(groupId)) notFound();

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/connections/groups/${groupId}`)}`);
  }

  const supabase = await createSupabaseServerClient();
  const [groupResult, membersResult] = await Promise.all([
    supabase.rpc("get_connection_group", { p_group_id: groupId }),
    supabase.rpc("list_connection_group_members", { p_group_id: groupId })
  ]);

  if (groupResult.error || membersResult.error) {
    throw new Error("グループを読み込めませんでした。");
  }

  const row = groupResult.data?.[0];
  if (!row) notFound();

  const group = mapConnectionGroupRow({ ...row, member_names: [], active_event_count: 0 });
  const members = (membersResult.data ?? []).map(mapConnectionGroupMemberRow);

  return <ConnectionGroupDetail group={group} members={members} />;
}
```

（`isUuid` の判定は `getCurrentUserId` より前に置き、不正な ID ではログインの確認もしない。テストの1件目がこれを確かめる）

- [ ] **Step 4: 中身のコンポーネントを作る**

`components/account/connection-group-detail.tsx`:

```tsx
"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import React, { useState, useTransition } from "react";
import { clsx } from "clsx";

import { ConnectionGroupColorField } from "@/components/account/connection-group-color-field";
import {
  addConnectionGroupMembersAction,
  deleteConnectionGroupAction,
  loadConnectionGroupCandidatesAction,
  removeConnectionGroupMemberAction,
  updateConnectionGroupAction
} from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  type ConnectionGroup,
  type ConnectionGroupColor,
  type ConnectionGroupMember
} from "@/lib/domain/account/connection-groups";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function ConnectionGroupDetail({ group, members }: { group: ConnectionGroup; members: ConnectionGroupMember[] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState<ConnectionGroupColor>(group.color);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [candidates, setCandidates] = useState<ConnectionGroupMember[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const remaining = Math.max(connectionGroupLimits.members - group.memberCount, 0);

  function run(action: () => Promise<{ status: string; message?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === "error") {
          setError(result.message ?? "操作を完了できませんでした");
          return;
        }
        onSuccess?.();
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "操作を完了できませんでした");
      }
    });
  }

  function openCandidates() {
    setError(null);
    startTransition(async () => {
      try {
        setCandidates(await loadConnectionGroupCandidatesAction(group.id));
        setSelected([]);
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "候補を読み込めませんでした");
      }
    });
  }

  function toggleCandidate(userId: string) {
    setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  return (
    <div className="grid gap-6">
      <Link href="/connections" className="text-sm font-bold text-pine underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-clay">
        ← つながりへ戻る
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className={clsx("h-3.5 w-3.5 rounded-full", connectionGroupDotClass[group.color])} />
          <h1 className="text-title text-ink">{group.name}</h1>
          <span className="text-body text-muted">{group.memberCount}人</span>
        </div>
        <p className="text-caption text-muted">このグループは自分だけに見えます。メンバーには通知されません。</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => setIsEditing((open) => !open)}>
            名前と色を変える
          </button>
          <button type="button" className={clsx(secondaryButton, "text-clay-ink")} onClick={() => setConfirmingDelete(true)}>
            グループを削除
          </button>
        </div>

        {isEditing ? (
          <form
            className="grid gap-3 rounded-control border border-line bg-surface p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateConnectionGroupAction(group.id, { name, color }), () => setIsEditing(false));
            }}
          >
            <label className="grid gap-1" htmlFor="connection-group-name">
              <span className="text-body font-bold text-ink">グループ名</span>
              <input
                id="connection-group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={connectionGroupLimits.nameLength}
                required
                className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </label>
            <ConnectionGroupColorField name="connection-group-color" value={color} onChange={setColor} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={isPending} className={primaryButton}>
                保存する
              </button>
              <button type="button" className={secondaryButton} onClick={() => setIsEditing(false)}>
                やめる
              </button>
            </div>
          </form>
        ) : null}

        {confirmingDelete ? (
          <div className="rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite">
            <p className="text-sm font-semibold text-ink">
              「{group.name}」を削除しますか？ メンバーとのつながりはそのまま残ります。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => deleteConnectionGroupAction(group.id))}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
              >
                削除する
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirmingDelete(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="connection-group-members-heading" className="grid gap-3">
        <h2 id="connection-group-members-heading" className="text-xl font-semibold text-ink">
          メンバー
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">まだメンバーがいません。「メンバーを追加」から入れられます。</p>
        ) : (
          <ul aria-label="メンバー" className="grid gap-2">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{member.displayName}</span>
                  <span className="block text-caption text-muted">
                    共通のイベント {member.sharedEventCount}件{member.isFollowing ? "・フォロー中" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  aria-label={`${member.displayName}をグループから外す`}
                  onClick={() => run(() => removeConnectionGroupMemberAction(group.id, member.userId))}
                  className={secondaryButton}
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-1">
          <button type="button" disabled={remaining === 0 || isPending} onClick={openCandidates} className={secondaryButton}>
            メンバーを追加
          </button>
          {remaining === 0 ? <p className="text-caption text-muted">1つのグループに入れられるのは30人までです</p> : null}
        </div>

        {candidates ? (
          <div role="group" aria-label="追加する人" className="grid gap-2 rounded-control border border-line bg-sunken p-3">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">追加できる人がいません。一緒にイベントに参加した人か、フォロー中の人を入れられます。</p>
            ) : (
              <ul className="grid gap-1">
                {candidates.map((candidate) => {
                  const checked = selected.includes(candidate.userId);
                  return (
                    <li key={candidate.userId}>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && selected.length >= remaining}
                          onChange={() => toggleCandidate(candidate.userId)}
                          className="h-5 w-5 shrink-0 accent-moss"
                        />
                        {candidate.displayName}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {selected.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  className={primaryButton}
                  onClick={() => run(() => addConnectionGroupMembersAction(group.id, selected), () => setCandidates(null))}
                >
                  {selected.length}人を追加
                </button>
              ) : null}
              <button type="button" className={secondaryButton} onClick={() => setCandidates(null)}>
                閉じる
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-clay-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run tests/account/connection-group-detail.test.tsx tests/account/connection-group-page.test.tsx && npx tsc --noEmit`
Expected: PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add app/connections/groups components/account/connection-group-detail.tsx tests/account/connection-group-detail.test.tsx tests/account/connection-group-page.test.tsx
git commit -m "feat(connections): グループ画面（メンバーの一覧と編集）を足す"
```

---

### Task 10: 設計doc の更新と、PR 前の検証

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-connection-groups-design.md`

- [ ] **Step 1: 設計doc を実装に合わせる**

次の3点を書き換える。
- 決定事項の表「招待候補の並び」: 「今のまま（サーバーからの並び）。お気に入りを先頭にする並べ替え関数 `sortInviteCandidates` は画面から使われていないので、PR④でお気に入りと一緒に消す」
- 「色」の節: 保存するキーの `movie-stage` を `movie_stage` にする（カテゴリ定数と同じ綴り）
- 「RPC（新規・変更）」の `list_connections` の項: 「人の行の所属グループは、`list_connection_group_memberships`（自分のグループの所属を一括で返す）で読み、`list_connections` には列を足さない。`list_connections` と `get_connection_counts` からはお気に入りの振り分けを外す（お気に入りの人も相互フォロー・フォロー中に出る）」

- [ ] **Step 2: 全テスト・型・lint・build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: すべて成功。件数を記録する。

- [ ] **Step 3: 画面の確認**

`visual-qa`（functional mode）と `accessibility` を通す。ローカルはログインできないため、見る箇所を箇条書きにしてユーザーの本番確認に回す準備をする（Task 11）。

- [ ] **Step 4: コミットと PR**

```bash
git add docs/superpowers/specs/2026-09-25-connection-groups-design.md
git commit -m "docs(spec): グループの設計を実装に合わせる（並び順・色のキー・所属の読み方）"
```

Codex（Sol / high）で PR 前レビュー → 指摘の裏取りと対応 → PR を作る。PR 本文に「053 は本番適用済み。054 はデプロイ直後に適用する」と書く。

---

### Task 11: 【止まって確認】マージ・デプロイ後に 054 を本番へ適用する

- [ ] **Step 1: マージの承認を得る**（PR の要約を1〜2行で示す）

- [ ] **Step 2: デプロイ完了を確かめてから、054 の適用の承認を得る**

「お気に入りを『お気に入り』グループへ移す migration 054 を本番に適用してよいか」を、対象の人数（`select count(distinct user_id) from public.user_favorites`）を添えて聞く。

- [ ] **Step 3: 適用して確かめる**

適用後、`select count(*) from public.connection_groups where name = 'お気に入り'` が上の人数と一致すること、`select private.migrate_favorites_to_connection_groups()` をもう一度呼んで 0 が返ることを確かめる。

- [ ] **Step 4: ユーザーに本番の見た目の確認を頼む**

- どの画面: スマホで `/connections` を開く
- 見るもの: 上から「届いた招待」「グループ」「人」の順。お気に入りがいた場合は「お気に入り」グループがあり、その人たちが入っている。タブは「一緒に参加／フォロー中／相互フォロー／ブロック中」
- 操作: 「＋ グループを作る」で1つ作る → グループ画面に進む → 「メンバーを追加」で1人入れる → つながり画面に戻り、その人の行にグループ名が出ている
- NG: お気に入りの文言が残っている／お気に入りだった人がどのタブにもいない／グループ画面が404になる
