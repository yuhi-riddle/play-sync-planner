# FU #3 / PR-A（進行状態フィルタの RPC マイグレーション＋テスト）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `list_owned_event_ids` RPC に進行状態（`display_state`）の計算と `p_display_state` 絞り込み引数を足す。呼び出し側コードはまだ変えない（PR-B）。

**Architecture:** 新マイグレーション047で関数を drop+recreate（7引数目 `p_display_state text default 'all'`）。`getEventDisplayState`（TS）の7分岐カスケードを SQL の CASE でミラーし、`filtered` CTE に絞り込み節を1つ足す。文字列アサーションテストと、`pg` で実DBに各状態を seed して TS の分類と一致することを見る DB パリティテストを付ける。7引数関数は6引数呼び出しとも互換（default）なので、この PR をマージしても既存コードは壊れない。

**Tech Stack:** PostgreSQL (Supabase) / Vitest / `pg`（DB テスト） / CI の `db-tests` ジョブ（postgres:16 を立てて全マイグレーション適用 → `vitest.db.config.ts`）

## Global Constraints

- TDD 必須。テストを先に書き、**RED を実際に確認**してから実装。
- 失敗テストをスキップ・削除して「解決」にしない。
- 依頼と無関係なリファクタ・整形をしない。
- **このマイグレーションを本番DBに適用するのはユーザー作業**。PR-A マージ後、ユーザーが SQL エディタで047を流し、そのあと PR-B をマージする。
- `display_state` の CASE7分岐は `getEventDisplayState`（`lib/domain/event/event-filter.ts:262`）と**分岐条件も順序も完全一致**させる。
- `p_now` のような本番未使用の引数は足さない。
- URL パラメータ名やチップ UI は PR-B の担当。PR-A では触らない。
- テスト実行: 単体は `npx vitest run --reporter=dot <path>`、DB テストは `npm run test:db`。
- コミットはタスクごと。メッセージ末尾に
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` と
  `Claude-Session: https://claude.ai/code/session_01CWv6Qmf1S7ujVo4PkKDLDS`。

## 参照

- 設計: `docs/superpowers/specs/2026-09-04-event-list-progress-state-filter-design.md`
- ベースにする関数の現物: `supabase/migrations/029_event_list_search.sql`
- 文字列アサーションテストの作法: `tests/event/schema/event-list-search.test.ts`
- DB テストの作法: `tests/db/plan-write-rpcs.test.ts`（`pg.Client` ＋ `begin`/`rollback` ＋ `set_config('request.jwt.claim.sub', …)`）
- 権限の revoke/grant の作法: `supabase/migrations/032_revoke_anon_function_privileges.sql`

## File Structure

- `supabase/migrations/047_event_list_progress_state_filter.sql`（新規）— 関数の drop+recreate、grant/revoke、ロールバックコメント。
- `tests/event/schema/event-list-progress-state.test.ts`（新規）— 047 SQL の文字列アサーション。
- `tests/db/event-list-progress-state.test.ts`（新規）— 実DBで7状態 seed → RPC vs TS のパリティ。
- `scripts/security/verify-function-privileges.mjs`（修正）— `list_owned_event_ids` の呼び出しに `p_display_state: "all"` を足す（2箇所）。
- `docs/current-status.md`（修正）— マイグレーション適用チェックリストに047の行。

---

## Task 1: マイグレーション047＋文字列アサーションテスト

**Files:**
- Create: `supabase/migrations/047_event_list_progress_state_filter.sql`
- Create/Test: `tests/event/schema/event-list-progress-state.test.ts`

**Interfaces:**
- Produces: SQL 関数 `public.list_owned_event_ids(text, text, text, integer, bigint, text, text)`。
  7引数目 `p_display_state text default 'all'`。戻り値は従来どおり `table(event_ids uuid[], total_count bigint)`。
  返す `event_ids` は「フィルタ・検索・カテゴリ・**進行状態**を満たすイベントを、並び順で `p_offset` から `p_limit` 件」。
  `total_count` はページング前の該当総数。

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/schema/event-list-progress-state.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/047_event_list_progress_state_filter.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** SQL の -- コメントを取り除いた本文。コメント内の偽装で assertion をすり抜けさせない。 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("event list progress-state filter migration", () => {
  it("旧6引数シグネチャを drop してから7引数で作り直す", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(
      /drop function if exists public\.list_owned_event_ids\(text, text, text, integer, bigint, text\)/i
    );
    expect(code).toMatch(/p_display_state text default 'all'/);
  });

  it("display_state の CASE が getEventDisplayState と同じ順序の7分岐を持つ", () => {
    const code = stripSqlComments(readMigration());
    const caseMatch = code.match(/case[\s\S]*?end as display_state/i);
    expect(caseMatch, "display_state を組み立てる CASE が見つからない").not.toBeNull();

    const expr = caseMatch![0];
    const order = [
      "settlement_waiting",
      "cancelled",
      "completed",
      "answer_waiting",
      "event_waiting",
      "participant_waiting",
      "schedule_creation_waiting"
    ];
    const positions = order.map((state) => expr.indexOf(`'${state}'`));
    positions.forEach((pos, index) => {
      expect(pos, `${order[index]} が CASE に無い`).toBeGreaterThanOrEqual(0);
    });
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions, "CASE の分岐順序が getEventDisplayState と違う").toEqual(sorted);
  });

  it("進行状態の判定に必要な集約がある", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toContain("as has_collecting_answers");
    expect(code).toContain("as has_upcoming_confirmed");
    // has_upcoming_confirmed は「未来の確定開始」で判定する
    expect(code).toMatch(/confirmed_start_at is not null[\s\S]*?confirmed_start_at > now\(\)/);
  });

  it("p_display_state で filtered を絞る", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/display_state_value = 'all' or [\w.]+\.display_state = [\w.]+\.display_state_value/);
    // 検証済みの値だけ受ける
    expect(code).toMatch(/p_display_state in \([\s\S]*?'settlement_waiting'[\s\S]*?\)/);
  });

  it("7引数シグネチャに grant / revoke を張り直す", () => {
    const code = stripSqlComments(readMigration());
    const sig = "public.list_owned_event_ids(text, text, text, integer, bigint, text, text)";
    expect(code).toContain(`revoke all on function ${sig} from public`);
    expect(code).toContain(`revoke all on function ${sig} from anon`);
    expect(code).toContain(`grant execute on function ${sig} to authenticated`);
  });
});
```

- [ ] **Step 2: RED を確認**

Run: `npx vitest run --reporter=dot tests/event/schema/event-list-progress-state.test.ts`
Expected: FAIL（`047_*.sql` が存在せず readFileSync が投げる）

- [ ] **Step 3: マイグレーション047を書く**

`supabase/migrations/047_event_list_progress_state_filter.sql`（全文）:

```sql
-- イベント一覧の絞り込みに「進行状態」を足す。
--
-- いままで list_owned_event_ids は active / cancelled / completed の3値でしか絞れなかった。
-- カードのバッジ（lib/domain/event/event-filter.ts の getEventDisplayState）が出している
-- 参加者待ち / 日程作成待ち / 回答待ち / 開催待ち / 清算待ち でも絞れるようにする。
-- ページング・件数は RPC の中で完結しているので、状態計算も RPC に持たせる必要がある。
--
-- CASE の分岐は getEventDisplayState と条件・順序を完全一致させる。ズレると
-- カードのバッジと絞り込み結果が食い違う。tests/db/event-list-progress-state.test.ts が
-- 実DB上で両者の一致を検証する。
--
-- 引数を1つ増やすので create or replace では差し替えられない。先に旧シグネチャを落とす
-- （マイグレーションはトランザクション内なので、関数が消えている瞬間は外から見えない）。
-- 新しい7引数関数は6引数呼び出しとも互換（p_display_state に default 'all'）なので、
-- このマイグレーションを本番に適用したあと、旧コード（6引数呼び出し）はそのまま動く。
drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text);

create or replace function public.list_owned_event_ids(
  p_filter text default 'active',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset bigint default 0,
  p_query text default null,
  p_display_state text default 'all'
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
      greatest(coalesce(p_offset, 0::bigint), 0::bigint) as offset_value,
      -- ilike のワイルドカードを潰す。潰さないと「%」の1文字で全件一致になる。
      -- 逆順に置換するとエスケープ用の \ 自身をもう一度エスケープしてしまうので、\ を先に処理する。
      case
        when nullif(btrim(coalesce(p_query, '')), '') is null then null
        else replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_')
      end as query_value,
      -- 進行状態。getEventDisplayState の7値だけ受ける。それ以外（'all' 含む）は絞らない。
      case
        when p_display_state in (
          'participant_waiting', 'schedule_creation_waiting', 'answer_waiting',
          'event_waiting', 'settlement_waiting', 'completed', 'cancelled'
        ) then p_display_state
        else 'all'
      end as display_state_value
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
      bool_or(p.settlement_status = 'settled') as has_settled,
      -- getEventDisplayState の分岐4: collecting_answers の plan があるか
      bool_or(p.status = 'collecting_answers') as has_collecting_answers,
      -- getEventDisplayState の分岐5: hasUpcomingConfirmedSchedule のミラー。
      -- confirmed_start_at は timestamptz なので TS の startOfScheduleTimestamp は素通しで、
      -- 実質 confirmed_start_at > now と同値。cancelled/skipped の plan は除く。
      bool_or(
        p.status not in ('cancelled', 'skipped')
        and p.confirmed_start_at is not null
        and p.confirmed_start_at > now()
      ) as has_upcoming_confirmed
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
      e.title,
      e.location_name,
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
  event_display as (
    -- lifecycle_finished / settlement_state は event_state の同じ SELECT 内で計算しているので、
    -- 兄弟カラムを参照できない。1段かぶせて display_state を出す。
    -- 分岐は getEventDisplayState（lib/domain/event/event-filter.ts）と完全に同じ順序。
    select
      es.*,
      case
        when es.lifecycle_finished and es.settlement_state not in ('not_needed', 'settled')
          then 'settlement_waiting'
        when es.status = 'cancelled' then 'cancelled'
        when es.lifecycle_finished then 'completed'
        when es.has_collecting_answers then 'answer_waiting'
        when es.has_upcoming_confirmed then 'event_waiting'
        when es.status = 'interested' then 'participant_waiting'
        else 'schedule_creation_waiting'
      end as display_state
    from event_state as es
  ),
  filtered as (
    select ed.*, n.sort_value
    from event_display as ed
    cross join normalized as n
    where (n.category_value = 'all' or ed.category = n.category_value)
      and (
        n.query_value is null
        or ed.title ilike '%' || n.query_value || '%'
        or coalesce(ed.location_name, '') ilike '%' || n.query_value || '%'
      )
      and case n.filter_value
        when 'active' then not ed.lifecycle_finished or ed.settlement_state not in ('not_needed', 'settled')
        when 'cancelled' then ed.status = 'cancelled'
        when 'completed' then ed.status <> 'cancelled'
          and ed.lifecycle_finished
          and ed.settlement_state in ('not_needed', 'settled')
        else false
      end
      and (n.display_state_value = 'all' or ed.display_state = n.display_state_value)
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
          and ordinal <= offset_value + limit_value::bigint
      ),
      '{}'::uuid[]
    ) as event_ids,
    (select count(*)::bigint from ordered) as total_count;
$$;

revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from public;
revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from anon;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) to authenticated;

-- ロールバック（この変更を戻す場合はこれを実行する）:
--
-- drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text, text);
-- （そのうえで migration 029 の関数本体を再作成し、
--   revoke all ... (text, text, text, integer, bigint, text) from public;
--   grant execute ... (text, text, text, integer, bigint, text) to authenticated; を張り直す）
```

- [ ] **Step 4: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/event/schema/event-list-progress-state.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/047_event_list_progress_state_filter.sql tests/event/schema/event-list-progress-state.test.ts
git commit -m "feat(events): list_owned_event_ids に進行状態フィルタを足す（migration 047）"
```

---

## Task 2: DB パリティテスト（RPC vs getEventDisplayState）

**Files:**
- Create: `tests/db/event-list-progress-state.test.ts`

**Interfaces:**
- Consumes: Task 1 の関数 `list_owned_event_ids(..., p_display_state)`、既存の TS `getEventDisplayState`（`@/lib/domain/event/event-filter`）。

このテストは実 Postgres が要る。CI の `db-tests` ジョブが全マイグレーション適用済みの
postgres:16 で `npm run test:db` を回す。ローカルで回すなら:

```bash
# 別ターミナルで postgres を用意（例: docker）
docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
# 環境変数
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 -f scripts/ci-bootstrap-db.sql
bash scripts/apply-migrations.sh
psql -v ON_ERROR_STOP=1 -f scripts/ci-grant-supabase-roles.sql
```

- [ ] **Step 1: テストを書く**

`tests/db/event-list-progress-state.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getEventDisplayState, type EventListItem } from "@/lib/domain/event/event-filter";

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

const NOW = new Date();
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}
const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => iso(d).slice(0, 10);

let ownerId: string;

/** owner の events を1件作り、joined メンバーも入れる。返り値は event id。 */
async function makeEvent(status: string, opts: { startDate?: Date; endDate?: Date } = {}): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `insert into public.events (id, owner_user_id, title, category, status, start_date, end_date)
     values ($1, $2, 'parity', 'other', $3, $4, $5)`,
    [eventId, ownerId, status, opts.startDate ? dateOnly(opts.startDate) : null, opts.endDate ? dateOnly(opts.endDate) : null]
  );
  await client.query(
    `insert into public.event_members (event_id, user_id, display_name, role, status)
     values ($1, $2, 'me', 'member', 'joined')`,
    [eventId, ownerId]
  );
  return eventId;
}

type PlanSeed = {
  status: string;
  settlementStatus?: string;
  confirmedStart?: Date | null;
  confirmedEnd?: Date | null;
  isAllDay?: boolean;
};

async function addPlan(eventId: string, seed: PlanSeed): Promise<void> {
  await client.query(
    `insert into public.plans
       (event_id, owner_user_id, title, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)
     values ($1, $2, 'p', $3, $4, $5, $6, $7)`,
    [
      eventId,
      ownerId,
      seed.status,
      seed.settlementStatus ?? "not_started",
      seed.confirmedStart ? iso(seed.confirmedStart) : null,
      seed.confirmedEnd ? iso(seed.confirmedEnd) : null,
      seed.isAllDay ?? false
    ]
  );
}

/** DB に入れたのと同じ内容から EventListItem を組み立てる（TS 判定に食わせる用）。 */
function toItem(status: string, plans: PlanSeed[], startDate?: Date, endDate?: Date): EventListItem {
  return {
    status,
    created_at: iso(NOW),
    start_date: startDate ? dateOnly(startDate) : null,
    end_date: endDate ? dateOnly(endDate) : null,
    plans: plans.map((p) => ({
      status: p.status,
      settlement_status: p.settlementStatus ?? "not_started",
      confirmed_start_at: p.confirmedStart ? iso(p.confirmedStart) : null,
      confirmed_end_at: p.confirmedEnd ? iso(p.confirmedEnd) : null,
      is_all_day: p.isAllDay ?? false
    })),
    event_members: [{ status: "joined" }]
  };
}

async function rpcIds(displayState: string): Promise<string[]> {
  const { rows } = await client.query<{ event_ids: string[] }>(
    `select event_ids from public.list_owned_event_ids('active', 'all', 'newest', 50, 0, null, $1)`,
    [displayState]
  );
  return rows[0]?.event_ids ?? [];
}

const DISPLAY_STATES = [
  "participant_waiting",
  "schedule_creation_waiting",
  "answer_waiting",
  "event_waiting",
  "settlement_waiting",
  "completed",
  "cancelled"
] as const;

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("begin");
  ownerId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [ownerId, `${ownerId}@e.test`]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
});
afterEach(async () => {
  await client.query("rollback");
});

describe("list_owned_event_ids の display_state 絞り込みは getEventDisplayState と一致する", () => {
  it("7状態それぞれで RPC の結果と TS の分類が一致する", async () => {
    // 各状態に当たる event を1件ずつ作る。境界は現在時刻から3日離す。
    const specs: { id: string; item: EventListItem }[] = [];

    // participant_waiting: status='interested'、plan なし
    {
      const id = await makeEvent("interested");
      specs.push({ id, item: toItem("interested", []) });
    }
    // schedule_creation_waiting: status='planning'、plan なし、開催日未設定
    {
      const id = await makeEvent("planning");
      specs.push({ id, item: toItem("planning", []) });
    }
    // answer_waiting: collecting_answers の plan あり
    {
      const id = await makeEvent("planning");
      await addPlan(id, { status: "collecting_answers" });
      specs.push({ id, item: toItem("planning", [{ status: "collecting_answers" }]) });
    }
    // event_waiting: 3日後に確定予定
    {
      const start = daysFromNow(3);
      const end = daysFromNow(3);
      const id = await makeEvent("confirmed");
      await addPlan(id, { status: "date_confirmed", confirmedStart: start, confirmedEnd: end });
      specs.push({
        id,
        item: toItem("confirmed", [{ status: "date_confirmed", confirmedStart: start, confirmedEnd: end }])
      });
    }
    // settlement_waiting: 3日前に終わった確定予定＋清算 settling
    {
      const start = daysFromNow(-3);
      const end = daysFromNow(-3);
      const id = await makeEvent("confirmed");
      await addPlan(id, {
        status: "date_confirmed",
        settlementStatus: "settling",
        confirmedStart: start,
        confirmedEnd: end
      });
      specs.push({
        id,
        item: toItem("confirmed", [
          { status: "date_confirmed", settlementStatus: "settling", confirmedStart: start, confirmedEnd: end }
        ])
      });
    }
    // completed: 3日前に終わった確定予定＋清算不要
    {
      const start = daysFromNow(-3);
      const end = daysFromNow(-3);
      const id = await makeEvent("done");
      await addPlan(id, {
        status: "date_confirmed",
        settlementStatus: "not_needed",
        confirmedStart: start,
        confirmedEnd: end
      });
      specs.push({
        id,
        item: toItem("done", [
          { status: "date_confirmed", settlementStatus: "not_needed", confirmedStart: start, confirmedEnd: end }
        ])
      });
    }
    // cancelled
    {
      const id = await makeEvent("cancelled");
      specs.push({ id, item: toItem("cancelled", []) });
    }

    // TS の分類（id -> displayState）
    const tsState = new Map(specs.map((s) => [s.id, getEventDisplayState(s.item, NOW)]));

    for (const state of DISPLAY_STATES) {
      const fromRpc = new Set(await rpcIds(state));
      const fromTs = new Set(specs.filter((s) => tsState.get(s.id) === state).map((s) => s.id));
      expect([...fromRpc].sort(), `state=${state}`).toEqual([...fromTs].sort());
    }
  });
});
```

- [ ] **Step 2: RED を確認**

ローカル pg を用意していない場合はこのステップは CI で確認する。用意している場合:

Run: `npm run test:db -- tests/db/event-list-progress-state.test.ts`
Expected（047 適用前の状態なら）: FAIL（関数が6引数で、7引数呼び出しが `function does not exist`）
※ このタスクは Task 1 のあとなので、ローカル pg にも047を再適用してから RED→GREEN を見る。
  047 適用後に RED を見たい場合は、`display_state` の CASE を一時的に全部 `'schedule_creation_waiting'` にして流し、
  6状態でズレることを確認 → 戻す。

- [ ] **Step 3: 実装は不要（Task 1 の047が対象）**

このタスクはテストだけ。047 が正しければ GREEN になる。ズレたら047の CASE / 集約を直す。

- [ ] **Step 4: GREEN を確認**

Run: `npm run test:db -- tests/db/event-list-progress-state.test.ts`
Expected: PASS（1件）
※ CI の `db-tests` ジョブでも確認される。

- [ ] **Step 5: コミット**

```bash
git add tests/db/event-list-progress-state.test.ts
git commit -m "test(events): RPC の進行状態絞り込みと getEventDisplayState のパリティを実DBで検証"
```

---

## Task 3: 権限テスト・チェックリスト・PR-A 仕上げ

**Files:**
- Modify: `scripts/security/verify-function-privileges.mjs`（`list_owned_event_ids` の呼び出し2箇所）
- Modify: `docs/current-status.md`

- [ ] **Step 1: verify-function-privileges の呼び出しに `p_display_state` を足す**

`scripts/security/verify-function-privileges.mjs` の2箇所（`FUNCTIONS` 相当の配列内の1つと、`runAuthenticatedContract` 相当の中の1つ）の
`{ p_filter: "all", p_category: "all", p_sort: "latest", p_limit: 1, p_offset: 0, p_query: null }` を
`{ p_filter: "all", p_category: "all", p_sort: "latest", p_limit: 1, p_offset: 0, p_query: null, p_display_state: "all" }` にする。

> 名前付き引数なので6引数のままでも新関数（default 付き）で動くが、意図を明示するために揃える。

- [ ] **Step 2: 関連テストを流す**

Run: `npx vitest run --reporter=dot tests/security/verify-function-privileges.test.ts`
Expected: PASS（期待値がシグネチャ文字列を直接持っていたら、そこも `, text, text` に更新する）

- [ ] **Step 3: `docs/current-status.md` にマイグレーション047の行を足す**

適用チェックリストの表（024 以降が抜けている箇所）に:

```
| 047 | event_list_progress_state_filter | 未適用 | PR-A マージ後に SQL エディタで実行。適用後に PR-B をマージする |
```

（既存の表の書式に合わせる。列が違うなら合わせる）

- [ ] **Step 4: 全体を流す**

Run: `npx vitest run --reporter=dot`
Expected: すべて PASS（DB テストはローカル pg が無ければ skip されるか失敗するので、その場合は `npm run test`（＝ `vitest run`、db 除外）で確認し、DB テストは CI に委ねる）

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 5: コミット & PR-A**

```bash
git add scripts/security/verify-function-privileges.mjs docs/current-status.md
git commit -m "chore(events): 進行状態フィルタに合わせて権限テストと適用チェックリストを更新"
git push -u origin <branch>
gh pr create --draft --base main \
  --title "FU #3 / PR-A: list_owned_event_ids に進行状態フィルタ（migration 047）" \
  --body "設計: docs/superpowers/specs/2026-09-04-event-list-progress-state-filter-design.md

RPC に p_display_state を足す。呼び出し側コード（UI・page.tsx）は PR-B。
7引数関数は6引数呼び出しと互換なので、このPRをマージしても既存コードは壊れない。

**マージ後の手順（ユーザー）**: SQL エディタで 047 を本番適用 → そのあと PR-B をマージ。

テスト: 文字列アサーション ＋ 実DBパリティ（CI の db-tests ジョブ）。"
```

---

## Self-Review 記録

- 設計 §1（RPC マイグレーション）→ Task 1。CASE7分岐・新集約2つ・`event_display` CTE・`filtered` の絞り込み節、すべて反映。
- 設計 §5-1（文字列アサーション）→ Task 1 Step 1。
- 設計 §5-2（DB パリティ）→ Task 2。`p_now` なし・境界±3日 seed。
- 設計 §6（verify-function-privileges / current-status.md / ロールバックコメント）→ Task 3 ＋ Task 1 の047末尾。
- 設計「出し方 PR-A」→ この計画全体。PR-B（domain・UI・page.tsx）は別計画。
- 型の一貫性: `list_owned_event_ids(text, text, text, integer, bigint, text, text)` のシグネチャは Task 1・3 で一致。`display_state` の7値は Task 1・2 で一致。
