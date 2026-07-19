# Event List and Connections Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント一覧の転送量を表示件数に比例させ、ブロック処理を原子的にし、ブロック一覧の人数分API呼び出しをなくす。

**Architecture:** PostgreSQLの `list_owned_event_ids` RPCで絞り込み・並べ替え・総件数・ページ対象IDを計算し、Next.js側は対象10〜50件のカードデータだけを取得する。`block_user_atomic` RPCでブロック登録と関係削除を同じトランザクションにまとめ、ブロックユーザー名は `profiles` の一括取得だけで解決する。

**Tech Stack:** Next.js 15、React 19、TypeScript、Supabase/PostgreSQL、Vitest、Testing Library、ESLint

## Global Constraints

- 一覧の対応中・完了・中止、清算、複数日程の判定結果を変えない。
- 表示対象イベントの詳細取得は1ページ10〜50件に限定する。
- 新しい集計列、トリガー、外部キャッシュ、依存パッケージは追加しない。
- RPCは `auth.uid()` を信頼境界にし、所有者IDや実行者IDを引数で受け取らない。
- `security definer` 関数は `search_path = public` を固定し、`authenticated` だけへ実行を許可する。
- 実装はテストを先に書き、期待した失敗を確認してから本体を変更する。
- Windowsでは `npm.cmd` を使う。Vitestの結果キャッシュ競合を避ける実行では `--no-cache` を付ける。

---

### Task 1: 一覧RPCと原子的ブロックRPCを追加する

**Files:**
- Create: `supabase/migrations/020_event_list_performance_and_atomic_block.sql`
- Create: `tests/supabase/performance-rpcs.test.ts`

**Interfaces:**
- Produces: `list_owned_event_ids(p_filter text, p_category text, p_sort text, p_limit integer, p_offset integer) -> table(event_ids uuid[], total_count bigint)`
- Produces: `block_user_atomic(target_user_id uuid) -> void`
- Consumes: `events`、`plans`、`user_blocks`、`user_connections`、`user_favorites`、`have_shared_event(uuid, uuid)`

- [ ] **Step 1: マイグレーション契約の失敗テストを書く**

```ts
// tests/supabase/performance-rpcs.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/020_event_list_performance_and_atomic_block.sql"
);

describe("event list performance and atomic block migration", () => {
  const migration = () => readFileSync(migrationPath, "utf8");

  it("returns ordered page ids and the full filtered count from one RPC", () => {
    const sql = migration();
    expect(sql).toContain("create or replace function public.list_owned_event_ids(");
    expect(sql).toContain("returns table(event_ids uuid[], total_count bigint)");
    expect(sql).toContain("e.owner_user_id = auth.uid()");
    expect(sql).toContain("owned_events as (");
    expect(sql).toContain("array_agg(id order by ordinal)");
    expect(sql).toContain("select count(*)::bigint from ordered");
  });

  it("keeps lifecycle, settlement, and schedule sorting rules in the database", () => {
    const sql = migration();
    expect(sql).toContain("p.status not in ('cancelled', 'skipped')");
    expect(sql).toContain("p.settlement_status = 'settling'");
    expect(sql).toContain("p.settlement_status = 'needed'");
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain("schedule_start");
  });

  it("blocks and removes both directions of relationships in one database function", () => {
    const sql = migration();
    expect(sql).toContain("create or replace function public.block_user_atomic(target_user_id uuid)");
    expect(sql).toContain("insert into public.user_blocks");
    expect(sql).toContain("delete from public.user_connections");
    expect(sql).toContain("delete from public.user_favorites");
    expect(sql).toContain("public.have_shared_event(current_user_id, target_user_id)");
  });

  it("limits RPC execution to authenticated users and adds query indexes", () => {
    const sql = migration();
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on function public.list_owned_event_ids(text, text, text, integer, integer) from public");
    expect(sql).toContain("grant execute on function public.list_owned_event_ids(text, text, text, integer, integer) to authenticated");
    expect(sql).toContain("revoke all on function public.block_user_atomic(uuid) from public");
    expect(sql).toContain("grant execute on function public.block_user_atomic(uuid) to authenticated");
    expect(sql).toContain("events_owner_category_created_id_idx");
    expect(sql).toContain("plans_event_status_confirmed_idx");
  });
});
```

- [ ] **Step 2: 新しいテストがマイグレーション未作成で失敗することを確認する**

Run:

```powershell
npm.cmd exec vitest -- run tests/supabase/performance-rpcs.test.ts --no-cache
```

Expected: `ENOENT` で失敗し、対象が新しいマイグレーションファイルだと確認できる。

- [ ] **Step 3: 一覧RPC・ブロックRPC・複合インデックスを実装する**

```sql
-- supabase/migrations/020_event_list_performance_and_atomic_block.sql
create index if not exists events_owner_category_created_id_idx
on public.events(owner_user_id, category, created_at desc, id desc);

create index if not exists plans_event_status_confirmed_idx
on public.plans(event_id, status, confirmed_start_at, confirmed_end_at);

create or replace function public.list_owned_event_ids(
  p_filter text default 'active',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset integer default 0
)
returns table(event_ids uuid[], total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      case when p_filter in ('active', 'cancelled', 'completed') then p_filter else 'active' end as filter_value,
      case
        when p_category in ('nazotoki', 'live', 'travel', 'drinking', 'snowboard', 'boardgame', 'movie_stage', 'other')
          then p_category
        else 'all'
      end as category_value,
      case when p_sort in ('newest', 'soonest', 'latest') then p_sort else 'newest' end as sort_value,
      case when p_limit in (10, 20, 50) then p_limit else 10 end as limit_value,
      greatest(coalesce(p_offset, 0), 0) as offset_value
  ),
  owned_events as (
    select e.*
    from public.events as e
    where e.owner_user_id = auth.uid()
  ),
  plan_state as (
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
      bool_or(p.settlement_status = 'settled') as has_settled
    from public.plans as p
    join owned_events as e on e.id = p.event_id
    group by p.event_id
  ),
  event_state as (
    select
      e.id,
      e.category,
      e.status,
      e.created_at,
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
      end as settlement_state,
      coalesce(
        (
          select p.confirmed_start_at
          from public.plans as p
          where p.event_id = e.id
            and p.confirmed_start_at is not null
            and coalesce(p.confirmed_end_at, p.confirmed_start_at) >= now()
          order by p.confirmed_start_at asc
          limit 1
        ),
        (
          select p.confirmed_start_at
          from public.plans as p
          where p.event_id = e.id
            and p.confirmed_start_at is not null
          order by p.confirmed_start_at desc
          limit 1
        ),
        e.start_date::timestamp at time zone 'Asia/Tokyo'
      ) as schedule_start
    from owned_events as e
    left join plan_state as ps on ps.event_id = e.id
  ),
  filtered as (
    select es.*, n.sort_value
    from event_state as es
    cross join normalized as n
    where (n.category_value = 'all' or es.category = n.category_value)
      and case n.filter_value
        when 'active' then not es.lifecycle_finished or es.settlement_state not in ('not_needed', 'settled')
        when 'cancelled' then es.status = 'cancelled'
        when 'completed' then es.status <> 'cancelled'
          and es.lifecycle_finished
          and es.settlement_state in ('not_needed', 'settled')
        else false
      end
  ),
  ordered as (
    select
      id,
      row_number() over (
        order by
          case when sort_value = 'newest' then created_at end desc nulls last,
          case when sort_value = 'soonest' then schedule_start end asc nulls last,
          case when sort_value = 'latest' then schedule_start end desc nulls last,
          created_at desc,
          id desc
      ) as ordinal
    from filtered
  )
  select
    coalesce(
      (
        select array_agg(id order by ordinal)
        from ordered
        cross join normalized
        where ordinal > offset_value
          and ordinal <= offset_value + limit_value
      ),
      '{}'::uuid[]
    ) as event_ids,
    (select count(*)::bigint from ordered) as total_count;
$$;

create or replace function public.block_user_atomic(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid block target';
  end if;

  if not public.have_shared_event(current_user_id, target_user_id) then
    raise exception 'A shared event is required';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.user_connections
  where (follower_user_id = current_user_id and followed_user_id = target_user_id)
     or (follower_user_id = target_user_id and followed_user_id = current_user_id);

  delete from public.user_favorites
  where (user_id = current_user_id and favorite_user_id = target_user_id)
     or (user_id = target_user_id and favorite_user_id = current_user_id);
end;
$$;

revoke all on function public.list_owned_event_ids(text, text, text, integer, integer) from public;
revoke all on function public.block_user_atomic(uuid) from public;
grant execute on function public.list_owned_event_ids(text, text, text, integer, integer) to authenticated;
grant execute on function public.block_user_atomic(uuid) to authenticated;
```

- [ ] **Step 4: マイグレーション契約テストを通す**

Run:

```powershell
npm.cmd exec vitest -- run tests/supabase/performance-rpcs.test.ts --no-cache
```

Expected: 4 tests pass。

- [ ] **Step 5: マイグレーションとテストをコミットする**

```powershell
git add -- supabase/migrations/020_event_list_performance_and_atomic_block.sql tests/supabase/performance-rpcs.test.ts
git commit -m "feat: add event list and block RPCs"
```

---

### Task 2: イベント一覧をRPCページングへ切り替える

**Files:**
- Modify: `tests/events-page.test.tsx`
- Modify: `app/events/page.tsx:69-149`

**Interfaces:**
- Consumes: `list_owned_event_ids` の `{ event_ids: string[]; total_count: number | string }`
- Produces: RPCのID順を維持した `EventRow[]`
- Preserves: `getEventCardSummary`、`getEventListPagination`、`EventCard`

- [ ] **Step 1: RPC引数・限定取得・順序維持の失敗テストへ書き換える**

`tests/events-page.test.tsx` のイベント問い合わせヘルパーを次へ置き換える。

```ts
function createEventQuery(data: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data, error: null })
  };
}

function createRpcResult(eventIds: string[], totalCount: number) {
  return vi.fn().mockResolvedValue({
    data: [{ event_ids: eventIds, total_count: totalCount }],
    error: null
  });
}

function makeEvent(id: string, title: string) {
  return {
    id,
    title,
    category: "other",
    start_date: null,
    end_date: null,
    location_name: null,
    status: "planning",
    created_at: "2026-07-15T00:00:00Z",
    plans: [],
    event_members: []
  };
}
```

既存の全件バッチ取得テストを削除し、次のテストを追加する。

```ts
it("asks the database for one page and fetches only the returned event ids", async () => {
  const eventQuery = createEventQuery([
    makeEvent("event-2", "2番目"),
    makeEvent("event-1", "1番目")
  ]);
  const rpc = createRpcResult(["event-1", "event-2"], 1001);
  const draftQuery = createDraftQuery(null);
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    rpc,
    from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
  });

  render(await EventsPage({
    searchParams: Promise.resolve({
      status: "completed",
      category: "travel",
      sort: "soonest",
      limit: "20",
      page: "2"
    })
  }));

  expect(rpc).toHaveBeenCalledWith("list_owned_event_ids", {
    p_filter: "completed",
    p_category: "travel",
    p_sort: "soonest",
    p_limit: 20,
    p_offset: 20
  });
  expect(eventQuery.in).toHaveBeenCalledWith("id", ["event-1", "event-2"]);
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "1番目",
    "2番目"
  ]);
  expect(screen.getByText("21-40 / 1001件")).toBeInTheDocument();
});
```

範囲外ページの既存テストは、RPCが `event_ids: []`、`total_count: 15` を返す形に変える。下書きテストには `rpc: vi.fn()` を渡し、呼ばれていないことを確認する。

- [ ] **Step 2: 新しいイベント一覧テストが旧全件取得実装で失敗することを確認する**

Run:

```powershell
npm.cmd exec vitest -- run tests/events-page.test.tsx --no-cache
```

Expected: `list_owned_event_ids` が呼ばれず、ID限定取得も行われないため失敗する。

- [ ] **Step 3: 全件バッチ処理をRPC＋対象ID取得へ置き換える**

`app/events/page.tsx` から `EVENT_QUERY_BATCH_SIZE` と `filterAndSortEventsForList` のimportを削除し、型を追加する。

```ts
type EventListRpcRow = {
  event_ids: string[] | null;
  total_count: number | string | null;
};
```

`query.status !== "draft"` の処理を次へ置き換える。

```ts
if (query.status !== "draft") {
  const requestedOffset = (query.page - 1) * query.pageSize;
  const { data: rpcRows, error: rpcError } = await supabase.rpc("list_owned_event_ids", {
    p_filter: query.status,
    p_category: query.category,
    p_sort: query.sort,
    p_limit: query.pageSize,
    p_offset: requestedOffset
  });
  if (rpcError) throw new Error(rpcError.message);

  const rpcRow = (rpcRows?.[0] ?? null) as EventListRpcRow | null;
  const eventIds = rpcRow?.event_ids ?? [];
  totalItems = Number(rpcRow?.total_count ?? 0);

  const requestedPagination = getEventListPagination(totalItems, query.pageSize, query.page);
  if (requestedPagination.page !== query.page) {
    redirect(buildEventListHref(query, requestedPagination.page));
  }

  if (eventIds.length > 0) {
    const { data: pageRows, error: pageError } = await supabase
      .from("events")
      .select(
        "id, title, category, start_date, end_date, location_name, status, created_at, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
      )
      .in("id", eventIds);
    if (pageError) throw new Error(pageError.message);

    const rowsById = new Map(((pageRows ?? []) as EventRow[]).map((event) => [event.id, event]));
    eventRows = eventIds.flatMap((eventId) => {
      const event = rowsById.get(eventId);
      return event ? [event] : [];
    });
  }
}
```

既存の共通ページ補正は残す。上の早期補正は、範囲外ページで不要な詳細問い合わせを防ぐために必要。

- [ ] **Step 4: イベント一覧テストと状態判定テストを通す**

Run:

```powershell
npm.cmd exec vitest -- run tests/events-page.test.tsx tests/domain/event-filter.test.ts --no-cache
```

Expected: 両ファイルの全テストが通る。

- [ ] **Step 5: イベント一覧の変更をコミットする**

```powershell
git add -- app/events/page.tsx tests/events-page.test.tsx
git commit -m "perf: page event list through database RPC"
```

---

### Task 3: ブロック操作を原子的RPCへ切り替える

**Files:**
- Modify: `tests/actions/connections.test.ts`
- Modify: `lib/actions/connections.ts:26-47,142-178`

**Interfaces:**
- Consumes: `block_user_atomic({ target_user_id: string })`
- Preserves: `unblockUserAction` の現在の動作

- [ ] **Step 1: 成功時と失敗時のアクションテストを先に追加する**

hoisted mockへ `createSupabaseServerClient` を追加し、importを `blockUserAction, unblockUserAction` に変える。

```ts
const {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  revalidatePath
} = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser
}));

import { blockUserAction, unblockUserAction } from "@/lib/actions/connections";
```

```ts
describe("blockUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: currentUserId });
  });

  it("delegates the whole block operation to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await blockUserAction(blockedUserId);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("block_user_atomic", { target_user_id: blockedUserId });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/connections");
  });

  it("does not revalidate when the atomic RPC fails", async () => {
    createSupabaseServerClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { message: "database failure" } })
    });

    await expect(blockUserAction(blockedUserId)).rejects.toThrow("ブロックできませんでした");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 旧実装が直接3テーブルを更新するため失敗することを確認する**

Run:

```powershell
npm.cmd exec vitest -- run tests/actions/connections.test.ts --no-cache
```

Expected: `block_user_atomic` が呼ばれず、管理クライアントが使われるため失敗する。

- [ ] **Step 3: ブロックアクションをRPC呼び出しだけにする**

`requireConnectionTarget` から `allowBlocked` オプションを外し、ブロック以外のフォロー・お気に入り操作では現在の共有イベント・ブロック確認を残す。`blockUserAction` を次へ置き換える。

```ts
export async function blockUserAction(userId: string): Promise<void> {
  const { targetUserId } = await requireAuthenticatedTarget(userId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("block_user_atomic", {
    target_user_id: targetUserId
  });

  if (error) {
    throw new Error("ブロックできませんでした");
  }

  revalidateConnections();
}
```

- [ ] **Step 4: 接続アクションのテストを通す**

Run:

```powershell
npm.cmd exec vitest -- run tests/actions/connections.test.ts --no-cache
```

Expected: ブロック2件、解除1件が通る。

- [ ] **Step 5: 原子的ブロックへの切り替えをコミットする**

```powershell
git add -- lib/actions/connections.ts tests/actions/connections.test.ts
git commit -m "fix: make user blocking atomic"
```

---

### Task 4: ブロックユーザー名のN+1 API呼び出しをなくす

**Files:**
- Modify: `app/connections/page.tsx:101-147`
- Modify: `lib/domain/connections.ts:57-70`
- Modify: `tests/domain/connections.test.ts:155-170`
- Create: `tests/connections-page-performance.test.ts`

**Interfaces:**
- Produces: `buildBlockedUsers({ blockedUserIds, profileNames })`
- Removes: ブロック一覧用 `fallbackNames` と `getBlockedUserDisplayName`
- Preserves: プロフィールが見つからない場合の `Madoiユーザー` 表示

- [ ] **Step 1: 既定名と管理API不使用の失敗テストを書く**

`tests/domain/connections.test.ts` の表示名テストを次へ変える。

```ts
it("uses profile names and a stable default without authentication lookups", () => {
  expect(
    buildBlockedUsers({
      blockedUserIds: ["profile-user", "unknown-user"],
      profileNames: new Map([["profile-user", "プロフィール名"]])
    })
  ).toEqual([
    { userId: "profile-user", displayName: "プロフィール名" },
    { userId: "unknown-user", displayName: "Madoiユーザー" }
  ]);
});
```

新しいソース境界テストを追加する。

```ts
// tests/connections-page-performance.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("connections page query count", () => {
  it("does not load blocked users one by one from the auth admin API", () => {
    const source = readFileSync(resolve(process.cwd(), "app/connections/page.tsx"), "utf8");
    expect(source).not.toContain("getUserById");
    expect(source).not.toContain("fallbackEntries");
    expect(source).toContain('from("profiles").select("user_id, nickname")');
  });
});
```

- [ ] **Step 2: N+1境界テストが旧実装の `getUserById` を検出して失敗することを確認する**

Run:

```powershell
npm.cmd exec vitest -- run tests/domain/connections.test.ts tests/connections-page-performance.test.ts --no-cache
```

Expected: 新しい引数形が合わず、`getUserById` も残っているため失敗する。

- [ ] **Step 3: プロフィール一括取得だけで表示名を組み立てる**

`lib/domain/connections.ts` の関数を次へ置き換える。

```ts
export function buildBlockedUsers({
  blockedUserIds,
  profileNames
}: {
  blockedUserIds: Iterable<string>;
  profileNames: ReadonlyMap<string, string>;
}): BlockedUser[] {
  return [...blockedUserIds].map((userId) => ({
    userId,
    displayName: profileNames.get(userId) ?? "Madoiユーザー"
  }));
}
```

`app/connections/page.tsx` では `fallbackEntries` と `getBlockedUserDisplayName` を削除し、呼び出しを次へ変える。

```ts
return buildBlockedUsers({
  blockedUserIds,
  profileNames
});
```

- [ ] **Step 4: ドメインテストとN+1境界テストを通す**

Run:

```powershell
npm.cmd exec vitest -- run tests/domain/connections.test.ts tests/connections-page-performance.test.ts --no-cache
```

Expected: 両ファイルの全テストが通る。

- [ ] **Step 5: N+1解消をコミットする**

```powershell
git add -- app/connections/page.tsx lib/domain/connections.ts tests/domain/connections.test.ts tests/connections-page-performance.test.ts
git commit -m "perf: remove blocked-user auth lookups"
```

---

### Task 5: 全体検証と差分確認を行う

**Files:**
- Verify: `supabase/migrations/020_event_list_performance_and_atomic_block.sql`
- Verify: `app/events/page.tsx`
- Verify: `lib/actions/connections.ts`
- Verify: `app/connections/page.tsx`
- Verify: `lib/domain/connections.ts`
- Verify: `tests/`

**Interfaces:**
- Consumes: Tasks 1〜4の成果物
- Produces: テスト・型・Lint・本番ビルドの検証結果

- [ ] **Step 1: 対象テストをまとめて再実行する**

```powershell
npm.cmd exec vitest -- run tests/supabase/performance-rpcs.test.ts tests/events-page.test.tsx tests/domain/event-filter.test.ts tests/actions/connections.test.ts tests/domain/connections.test.ts tests/connections-page-performance.test.ts --no-cache
```

Expected: 対象テストがすべて通る。

- [ ] **Step 2: 全テストをキャッシュなしで実行する**

```powershell
npm.cmd exec vitest -- run --no-cache
```

Expected: 全テストが失敗0、終了コード0で完了する。

- [ ] **Step 3: Lintを実行する**

```powershell
npm.cmd run lint
```

Expected: ESLintエラー0、終了コード0。

- [ ] **Step 4: 本番ビルドと型検査を実行する**

```powershell
npm.cmd run build
```

Expected: Next.jsの本番ビルド、Lint、型検査が成功し、終了コード0。

- [ ] **Step 5: 差分の空白エラーと作業範囲を確認する**

```powershell
git diff --check
git status --short
git diff --stat d771073..HEAD
```

Expected: `git diff --check` は出力なし。既存の未追跡ファイルは変更されず、差分は本計画の対象ファイルだけ。

- [ ] **Step 6: マイグレーション適用前提を引き渡しに明記する**

最終報告に次を含める。

```text
本番で新しい一覧・ブロック処理を使う前に、020_event_list_performance_and_atomic_block.sql の適用が必要です。ローカルではマイグレーションファイルと契約テストまで確認し、リモートDBへの適用は行っていません。
```
