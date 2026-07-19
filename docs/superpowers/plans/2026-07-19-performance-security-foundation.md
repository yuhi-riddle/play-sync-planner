# Madoi Performance and Security Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** つながり、カレンダー、イベント詳細を大量データでも3秒以内に操作可能にし、DB権限、入口防御、回数制限、監査、計測を最小権限で整える。

**Architecture:** 通常画面は利用者セッション付きSupabaseクライアントから、用途別RPCまたはRLS付きテーブルだけを呼ぶ。初回表示は20件、メッセージは50件に固定し、残りをカーソルで追加取得する。DB移行はexpand-contract方式にし、匿名権限を閉じた後でアプリを新経路へ切り替え、最後に旧公開関数を削除する。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript 5.7、Supabase/PostgreSQL、Zod 3、Vitest 2、Lighthouse（開発時のみ）

## Global Constraints

- 低性能スマートフォン相当、4倍CPU低速化、低速4G相当で主要部分を3秒以内に操作可能にする。
- 一覧RPCは20件、メッセージは50件を超えて返さない。代表的な大量データでDB応答1秒以内を目標にする。
- Google Calendarには5秒のタイムアウトを設け、失敗してもMadoiの予定を消さない。
- `security definer`は`set search_path = ''`、スキーマ付き参照、`auth.uid()`のNULL拒否を必須にする。
- `PUBLIC`と`anon`へ保護関数の実行権限を与えない。通常画面で管理権限クライアントを使わない。
- ログ、監査、性能計測へ本文、URLトークン、Googleトークン、Cookie、IPアドレス、完全URLを保存しない。
- 大量データ試験はlocalhostまたは明示した検証用Supabaseだけで実行し、本番接続値では必ず停止する。
- DB移行は追加型とし、既存の利用者データを削除しない。

---

## File Structure

### DBと検証

- Create: `supabase/migrations/021_function_privilege_hardening.sql` — 匿名実行の遮断、private補助関数、既定権限。
- Create: `supabase/migrations/022_page_query_performance.sql` — つながり、表示月、招待候補のRPCと索引。
- Create: `supabase/migrations/023_rate_limits_and_security_audit.sql` — 固定時間窓の回数制限と90日監査。
- Create: `supabase/migrations/024_performance_measurements.sql` — 非識別Web Vitalsと30日削除。
- Create: `tests/supabase/function-privileges.test.ts` — 021の権限契約。
- Create: `tests/supabase/page-query-performance.test.ts` — 022のRPC、上限、索引契約。
- Create: `tests/supabase/rate-limits-audit.test.ts` — 023の秘密値非保存と上限契約。
- Create: `tests/supabase/performance-measurements.test.ts` — 024の列、許可値、保持期間契約。
- Create: `scripts/security/verify-function-privileges.mjs` — anon/authenticated/service_roleの実測。
- Create: `tests/security-script.test.ts` — 権限実測スクリプトの安全装置。
- Create: `scripts/performance/seed-large-dataset.mjs` — 検証DB専用の大量データ生成。
- Create: `scripts/performance/benchmark-rpcs.mjs` — RPC件数とp95計測。
- Create: `scripts/performance/run-lighthouse.mjs` — 4倍CPU低速化、低速4G相当の3秒判定。

### アプリ共通

- Create: `lib/validation/request.ts` — UUID、年月、カーソル、分類のZodスキーマ。
- Create: `lib/server/request-guards.ts` — 認証と対象権限の共通ガード。
- Create: `lib/server/route-errors.ts` — 401、403、429と`Retry-After`の共通応答。
- Create: `lib/server/rate-limit.ts` — 認証済み利用者と公開トークンHMACの回数制限。
- Create: `lib/server/safe-log.ts` — 秘密値を受け取らない構造化ログ。
- Create: `lib/server/timing.ts` — `Server-Timing`と処理時間ログ。
- Create: `tests/admin-client-allowlist.test.ts` — 管理権限クライアント利用箇所の許可リスト。
- Create: `lib/server/admin/cron-notifications.ts` — Cron専用の通知作成。
- Create: `lib/server/admin/public-answer.ts` — 回答リンク検証後の回答保存。
- Create: `lib/server/admin/public-invite.ts` — 招待リンク検証後の参加処理。
- Create: `lib/server/admin/public-settlement.ts` — 清算リンク検証後の支払い記録。
- Create: `lib/server/admin/google-token-store.ts` — 暗号化済みGoogleトークンの更新。
- Create: `tests/request-guards.test.ts` — 認証、認可、入力、回数制限の共通契約。

### 画面

- Modify: `app/connections/page.tsx`、`components/connection-list.tsx`
- Create: `app/api/connections/route.ts`
- Modify: `app/plans/page.tsx`、`components/adjustment-calendar-view.tsx`
- Modify: `app/events/[eventId]/page.tsx`、`components/event-chat.tsx`、`components/event-invite-candidates.tsx`
- Create: `app/api/events/[eventId]/messages/route.ts`
- Create: `app/api/events/[eventId]/invite-candidates/route.ts`
- Create: `app/connections/loading.tsx`、`app/plans/loading.tsx`、`app/events/[eventId]/loading.tsx`

### 入口防御と計測

- Modify: `middleware.ts`、`next.config.ts`、`app/layout.tsx`
- Modify: `app/api/cron/notifications/route.ts`、`app/api/google-calendar/freebusy/route.ts`
- Create: `app/api/cron/retention/route.ts`
- Modify: `app/api/google-calendar/callback/route.ts`、`app/api/google-calendar/disconnect/route.ts`
- Create: `app/api/performance/vitals/route.ts`、`components/web-vitals-reporter.tsx`
- Create: `tests/middleware-security.test.ts`、`tests/cron-auth.test.ts`、`tests/web-vitals.test.tsx`

---

### Task 1: 現状値と管理権限利用箇所を固定する

**Files:**
- Create: `tests/admin-client-allowlist.test.ts`
- Create: `docs/performance-security-baseline.md`

**Interfaces:**
- Produces: `ADMIN_CLIENT_BASELINE_FILES: readonly string[]`
- Produces: 変更前の取得件数、主要画面応答、管理クライアント利用箇所の記録。

- [ ] **Step 1: 現在の管理クライアント利用箇所を固定する特性テストを書く**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ADMIN_CLIENT_BASELINE_FILES = [
  "app/api/cron/notifications/route.ts",
  "app/api/events/[eventId]/availability/route.ts",
  "app/connections/page.tsx",
  "app/events/[eventId]/page.tsx",
  "app/invites/[token]/page.tsx",
  "app/plans/[planId]/settlement/page.tsx",
  "app/plans/page.tsx",
  "app/s/[token]/answer/page.tsx",
  "app/s/[token]/settlement/page.tsx",
  "lib/actions/answers.ts",
  "lib/actions/calendar.ts",
  "lib/actions/connections.ts",
  "lib/actions/event-members.ts",
  "lib/actions/event-messages.ts",
  "lib/actions/plans.ts",
  "lib/actions/settlements.ts",
  "lib/google-calendar/access-token.ts",
  "lib/supabase/server.ts"
] as const;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sourceFilesUsing(needle: string) {
  const roots = ["app", "lib"];
  return roots.flatMap((root) => walk(resolve(process.cwd(), root)))
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .filter((path) => readFileSync(path, "utf8").includes(needle))
    .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"));
}

it("captures every current service-role client usage before hardening", () => {
  expect(sourceFilesUsing("createSupabaseAdminClient").sort()).toEqual(
    [...ADMIN_CLIENT_BASELINE_FILES].sort()
  );
});
```

`sourceFilesUsing`は`app`と`lib`を再帰走査し、`node_modules`と`.next`を除外し、リポジトリ相対パスを`/`区切りで返す。

- [ ] **Step 2: 特性テストが現在の状態で成功することを確認する**

Run: `npm.cmd exec vitest -- run tests/admin-client-allowlist.test.ts --no-cache`

Expected: 現在の18ファイルと一致してPASS。Task 8でこのテストを最終許可リストへ書き換えるまで、利用箇所が意図せず増えた場合だけFAIL。

- [ ] **Step 3: 現状値を記録する**

`docs/performance-security-baseline.md`へ、画面ごとのDB呼び出し数、初回取得行数、`createSupabaseAdminClient`利用ファイルを記録する。値が取得できない項目は「未計測」ではなく、実行したコマンドと失敗理由を記録する。

- [ ] **Step 4: コミットする**

```powershell
git add -- tests/admin-client-allowlist.test.ts docs/performance-security-baseline.md
git commit -m "test: capture security and performance baseline"
```

---

### Task 2: 保護関数の匿名実行を止める

**Files:**
- Create: `tests/supabase/function-privileges.test.ts`
- Create: `supabase/migrations/021_function_privilege_hardening.sql`
- Modify: `tests/supabase/performance-rpcs.test.ts`

**Interfaces:**
- Produces: `private.is_event_owner(uuid) returns boolean`
- Produces: `private.is_joined_event_member(uuid) returns boolean`
- Produces: `private.have_shared_event(uuid, uuid) returns boolean`
- Produces: `private.is_user_blocked(uuid, uuid) returns boolean`
- Preserves temporarily: 旧`public.*`補助関数は`authenticated`と`service_role`だけ実行可能。

- [ ] **Step 1: 021の契約テストを書く**

```ts
it("revokes protected helpers from PUBLIC and anon", () => {
  const sql = migration();
  for (const signature of [
    "public.is_event_owner(uuid)",
    "public.is_joined_event_member(uuid)",
    "public.have_shared_event(uuid, uuid)",
    "public.is_user_blocked(uuid, uuid)",
    "public.is_following(uuid, uuid)",
    "public.list_owned_event_ids(text, text, text, integer, bigint)"
  ]) {
    expect(sql).toContain(`revoke all on function ${signature} from public`);
    expect(sql).toContain(`revoke all on function ${signature} from anon`);
  }
  expect(sql).toContain("alter default privileges in schema public revoke execute on functions from public");
  expect(sql).toContain("alter default privileges in schema public revoke execute on functions from anon");
});

it("hardens security-definer helpers", () => {
  const sql = migration();
  expect(sql).toContain("create schema if not exists private");
  expect(sql).toContain("security definer\nset search_path = ''");
  expect(sql).toContain("if auth.uid() is null then");
  expect(sql).not.toContain("set search_path = public");
});
```

- [ ] **Step 2: テストが021未作成で失敗することを確認する**

Run: `npm.cmd exec vitest -- run tests/supabase/function-privileges.test.ts --no-cache`

Expected: `ENOENT`でFAIL。

- [ ] **Step 3: 021を実装する**

マイグレーションは1トランザクションで、次の順番を固定する。

```sql
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- private補助関数は actor_user_id を呼び出し元から受け取らない。
create or replace function private.is_event_owner(target_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = target_event_id and e.owner_user_id = auth.uid()
  );
$$;

create or replace function private.is_joined_event_member(target_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.event_members em
    where em.event_id = target_event_id and em.user_id = auth.uid() and em.status = 'joined'
  );
$$;
```

関係判定は次の形で、呼出者が当事者でない照会を拒否する。

```sql
create or replace function private.have_shared_event(first_user_id uuid, second_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and auth.uid() in (first_user_id, second_user_id)
    and exists (
      select 1
      from public.event_members first_member
      join public.event_members second_member
        on second_member.event_id = first_member.event_id
      where first_member.user_id = first_user_id
        and second_member.user_id = second_user_id
        and first_member.status = 'joined'
        and second_member.status = 'joined'
    );
$$;

create or replace function private.is_user_blocked(first_user_id uuid, second_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and auth.uid() in (first_user_id, second_user_id)
    and exists (
      select 1 from public.user_blocks b
      where (b.blocker_user_id = first_user_id and b.blocked_user_id = second_user_id)
         or (b.blocker_user_id = second_user_id and b.blocked_user_id = first_user_id)
    );
$$;
```

RLSポリシーと`block_user_atomic`の参照を`private.*`へ変更する。

最後に全対象関数へ`REVOKE ... FROM public, anon`を明示し、旧アプリとの短い共存期間のため`authenticated, service_role`だけへ必要な`EXECUTE`を許可する。既定権限も`PUBLIC`と`anon`から取り消して`commit`する。

- [ ] **Step 4: 静的契約テストを通す**

Run: `npm.cmd exec vitest -- run tests/supabase/function-privileges.test.ts tests/supabase/performance-rpcs.test.ts --no-cache`

Expected: 全件PASS。

- [ ] **Step 5: コミットする**

```powershell
git add -- supabase/migrations/021_function_privilege_hardening.sql tests/supabase/function-privileges.test.ts tests/supabase/performance-rpcs.test.ts
git commit -m "security: harden database function privileges"
```

---

### Task 3: DB権限を実環境で検証できるようにする

**Files:**
- Create: `scripts/security/verify-function-privileges.mjs`
- Create: `tests/security-script.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `SECURITY_TEST_SUPABASE_URL`、`SECURITY_TEST_ANON_KEY`。`SECURITY_TEST_MODE=full`では`SECURITY_TEST_USER_A_JWT`、`SECURITY_TEST_USER_B_JWT`、検証用イベント・利用者IDも使う。
- Produces: 終了コード0（契約一致）または1（匿名実行、越権、設定不足）。

- [ ] **Step 1: 検証スクリプトの入力契約テストを書く**

`tests/security-script.test.ts`で、接続先未指定、本番URLと一致、anonが200を返す、authenticatedが自分のRPCだけ成功、の4ケースを`fetch`モックで固定する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/security-script.test.ts --no-cache`

Expected: モジュール未作成でFAIL。

- [ ] **Step 3: 実測スクリプトを実装する**

```js
const protectedCalls = [
  ["is_event_owner", { target_event_id: crypto.randomUUID() }],
  ["is_joined_event_member", { target_event_id: crypto.randomUUID() }],
  ["have_shared_event", { first_user_id: crypto.randomUUID(), second_user_id: crypto.randomUUID() }],
  ["is_user_blocked", { first_user_id: crypto.randomUUID(), second_user_id: crypto.randomUUID() }],
  ["is_following", { follower_id: crypto.randomUUID(), followed_id: crypto.randomUUID() }],
  ["list_owned_event_ids", { p_filter: "all", p_category: "all", p_sort: "latest", p_limit: 1, p_offset: 0 }]
];
```

anon呼出しは全て401または403だけを成功条件にする。`SECURITY_TEST_MODE=full`では、利用者AのJWTで利用者Bのイベント、つながり、カレンダー、招待候補、メッセージを照会し、0件または403になることも検査する。`SECURITY_TEST_SUPABASE_URL === NEXT_PUBLIC_SUPABASE_URL`かつ`ALLOW_PRODUCTION_SECURITY_PROBE !== "true"`なら、通信前に終了コード1で停止する。本番確認は`SECURITY_TEST_MODE=anon-only`に固定し、架空UUIDだけを使ってレスポンス本文を保存しない。

- [ ] **Step 4: npmスクリプトと環境変数例を追加する**

```json
"security:verify-db": "node scripts/security/verify-function-privileges.mjs"
```

- [ ] **Step 5: テストしてコミットする**

```powershell
npm.cmd exec vitest -- run tests/security-script.test.ts --no-cache
git add -- scripts/security/verify-function-privileges.mjs tests/security-script.test.ts package.json .env.example
git commit -m "test: verify database privileges by role"
```

---

### Task 4: 用途別RPCと索引を追加する

**Files:**
- Create: `tests/supabase/page-query-performance.test.ts`
- Create: `supabase/migrations/022_page_query_performance.sql`

**Interfaces:**
- Produces: `public.get_connection_counts() returns table(category text, item_count bigint)`
- Produces: `public.list_connections(p_category text, p_cursor_at timestamptz, p_cursor_user_id uuid, p_limit integer) returns table(...)`
- Produces: `public.list_received_event_invitations(p_limit integer) returns table(...)`
- Produces: `public.list_calendar_items(p_month date) returns table(...)`
- Produces: `public.list_event_invite_candidates(p_event_id uuid, p_query text, p_cursor_at timestamptz, p_cursor_user_id uuid, p_limit integer) returns table(...)`

- [ ] **Step 1: RPC契約と上限の失敗テストを書く**

テストは5関数の完全なシグネチャ、`least(greatest(coalesce(p_limit, 20), 1), 20)`、`auth.uid()`のNULL拒否、安定した`created_at DESC, user_id DESC`カーソル、招待候補の所有者確認を検査する。メッセージ索引は`event_messages(event_id, created_at desc, id desc)`を要求する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/supabase/page-query-performance.test.ts --no-cache`

Expected: 022未作成でFAIL。

- [ ] **Step 3: 022を実装する**

戻り値を次で固定する。

```sql
-- list_connections
user_id uuid, display_name text, shared_event_count bigint,
latest_shared_at timestamptz, is_following boolean,
is_followed_by boolean, is_favorite boolean,
cursor_at timestamptz, cursor_user_id uuid

-- list_calendar_items
candidate_id uuid, plan_id uuid, event_title text, plan_title text,
start_at timestamptz, end_at timestamptz, is_all_day boolean,
status text, yes_count bigint, maybe_count bigint,
no_count bigint, unanswered_count bigint

-- list_event_invite_candidates
user_id uuid, display_name text, shared_event_count bigint,
latest_shared_at timestamptz, is_following boolean,
is_followed_by boolean, is_favorite boolean,
cursor_at timestamptz, cursor_user_id uuid

-- list_received_event_invitations
invitation_id uuid, event_id uuid, event_title text,
organizer_name text, created_at timestamptz
```

分類は`favorites | mutual | following | shared | blocked`だけを受け付ける。`p_month`は月初へ正規化し、取得範囲をカレンダー枠用の前後6日を含む範囲にする。招待候補は主催者以外を拒否し、既参加者と双方のブロックを除く。表示名は`profiles.nickname`、なければ最新の`event_members.display_name`、最後に`Madoiユーザー`とする。

既存索引を重複させず、足りない複合索引だけ`create index if not exists`で追加する。

- [ ] **Step 4: 静的契約テストを通す**

Run: `npm.cmd exec vitest -- run tests/supabase/page-query-performance.test.ts --no-cache`

Expected: 全件PASS。

- [ ] **Step 5: コミットする**

```powershell
git add -- supabase/migrations/022_page_query_performance.sql tests/supabase/page-query-performance.test.ts
git commit -m "perf: add bounded page query RPCs"
```

---

### Task 5: つながりを分類別20件のカーソル取得へ切り替える

**Files:**
- Create: `lib/validation/request.ts`
- Create: `app/api/connections/route.ts`
- Modify: `app/connections/page.tsx`
- Modify: `components/connection-list.tsx`
- Create: `app/connections/loading.tsx`
- Modify: `tests/connections-page-performance.test.ts`
- Modify: `tests/connection-list.test.tsx`

**Interfaces:**
- Produces: `ConnectionCategory = "favorites" | "mutual" | "following" | "shared" | "blocked"`
- Produces: `ConnectionPage = { items: ConnectionCandidate[]; nextCursor: string | null }`
- Consumes: Task 4の`get_connection_counts`と`list_connections`。

- [ ] **Step 1: 初回20件と追加取得の失敗テストを書く**

ページテストは管理クライアント不使用、件数RPCと選択分類RPCの2呼出し、`p_limit: 20`を検査する。部品テストは分類変更で`/api/connections?category=mutual`、追加ボタンでカーソル付きURLを呼び、失敗時も既存行を保持することを検査する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/connections-page-performance.test.ts tests/connection-list.test.tsx --no-cache`

Expected: 全件取得と管理クライアント利用が残っているためFAIL。

- [ ] **Step 3: 入力スキーマとAPIを実装する**

```ts
export const connectionCategorySchema = z.enum(["favorites", "mutual", "following", "shared", "blocked"]);
export const cursorSchema = z.string().max(200).transform((value, context) => {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid cursor" }); return z.NEVER; }
});
```

APIはログイン必須、分類・カーソル検証、RPCエラーの一般化を行い、`Cache-Control: private, no-store`で`ConnectionPage`だけ返す。

- [ ] **Step 4: ページと部品を切り替える**

初回は件数、届いた招待20件、選択分類20件を並列取得する。`ConnectionList`は分類ごとに`items/loading/error/nextCursor`を保持し、未取得分類を初めて選んだ時だけ取得する。「さらに20件表示」を押した時は既存配列へ追記する。

- [ ] **Step 5: ローディング境界を追加してテストする**

Run: `npm.cmd exec vitest -- run tests/connections-page-performance.test.ts tests/connection-list.test.tsx --no-cache`

Expected: 全件PASS。

- [ ] **Step 6: コミットする**

```powershell
git add -- lib/validation/request.ts app/api/connections/route.ts app/connections/page.tsx app/connections/loading.tsx components/connection-list.tsx tests/connections-page-performance.test.ts tests/connection-list.test.tsx
git commit -m "perf: page connections by category"
```

---

### Task 6: カレンダー取得を表示月だけにする

**Files:**
- Modify: `app/plans/page.tsx`
- Modify: `components/adjustment-calendar-view.tsx`
- Modify: `components/home-selected-date-agenda.tsx`
- Modify: `app/api/google-calendar/freebusy/route.ts`
- Modify: `lib/google-calendar/calendar-events.ts`
- Create: `app/plans/loading.tsx`
- Create: `tests/plans-page-month-scope.test.ts`
- Modify: `tests/google-calendar/calendar-events.test.ts`

**Interfaces:**
- Consumes: `list_calendar_items({ p_month: "YYYY-MM-01" })`
- Produces: 5秒で中断できる`fetchCalendarEvents({ accessToken, calendarId, month, signal })`。

- [ ] **Step 1: 月限定とタイムアウトの失敗テストを書く**

ページテストは`event_members`、全`plans`、管理クライアントを使わず、表示月RPCを1回だけ呼ぶことを検査する。Googleテストは`AbortSignal.timeout(5000)`相当のsignalがfetchへ渡ること、502でもMadoi候補を保持することを検査する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/plans-page-month-scope.test.ts tests/google-calendar/calendar-events.test.ts --no-cache`

Expected: 全期間取得とsignal未指定でFAIL。

- [ ] **Step 3: 表示月RPCへ切り替える**

`parseMonth`を`zod`の年月スキーマへ統合し、`list_calendar_items`の結果を`AdjustmentCandidate[]`へ写像する。前月・翌月はURLの`month`が変わった時だけServer Componentを再取得する。

- [ ] **Step 4: Google通信を5秒で中断する**

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);
try {
  return await fetchCalendarEvents({ accessToken, calendarId, month, signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

クライアント側は取得開始時にMadoiの候補配列を変更せず、Google項目だけを更新する。失敗時は再試行ボタンを表示する。

- [ ] **Step 5: テストしてコミットする**

```powershell
npm.cmd exec vitest -- run tests/plans-page-month-scope.test.ts tests/google-calendar/calendar-events.test.ts tests/adjustment-calendar-view.test.tsx --no-cache
git add -- app/plans/page.tsx app/plans/loading.tsx app/api/google-calendar/freebusy/route.ts components/adjustment-calendar-view.tsx components/home-selected-date-agenda.tsx lib/google-calendar/calendar-events.ts tests/plans-page-month-scope.test.ts tests/google-calendar/calendar-events.test.ts tests/adjustment-calendar-view.test.tsx
git commit -m "perf: scope calendar data to visible month"
```

---

### Task 7: イベント詳細を概要、チャット、招待候補へ分離する

**Files:**
- Modify: `app/events/[eventId]/page.tsx`
- Create: `app/events/[eventId]/loading.tsx`
- Create: `app/api/events/[eventId]/messages/route.ts`
- Create: `app/api/events/[eventId]/invite-candidates/route.ts`
- Modify: `components/event-chat.tsx`
- Modify: `components/event-invite-candidates.tsx`
- Modify: `tests/event-chat.test.tsx`
- Modify: `tests/event-invite-candidates.test.tsx`
- Create: `tests/event-detail-performance.test.tsx`

**Interfaces:**
- Produces: `MessagePage = { items: EventMessage[]; nextCursor: string | null }`
- Produces: `InviteCandidatePage = { items: ConnectionCandidate[]; nextCursor: string | null }`
- Consumes: RLS付き`event_messages`とTask 4の`list_event_invite_candidates`。

- [ ] **Step 1: 段階表示の失敗テストを書く**

概要レンダー時に招待候補RPCを呼ばないこと、チャットを50件に制限すること、過去分取得URLへ作成日時とIDのカーソルを渡すこと、招待欄を開いた時だけ候補APIを呼ぶことを検査する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/event-detail-performance.test.tsx tests/event-chat.test.tsx tests/event-invite-candidates.test.tsx --no-cache`

Expected: 詳細ページが招待候補を先読みするためFAIL。

- [ ] **Step 3: メッセージAPIを実装する**

```ts
const query = supabase
  .from("event_messages")
  .select("id, author_user_id, body, created_at")
  .eq("event_id", eventId)
  .order("created_at", { ascending: false })
  .order("id", { ascending: false })
  .limit(51);
```

カーソルがある場合は`created_at < cursor.createdAt OR (created_at = cursor.createdAt AND id < cursor.id)`を適用する。51件目は返さず次カーソル判定だけに使う。非参加者はRLSで0件となるだけでなく、共通ガードで403を返す。

- [ ] **Step 4: 招待候補APIと遅延UIを実装する**

主催者ガードの後に`list_event_invite_candidates`を20件で呼ぶ。部品は「招待する人を選ぶ」を押すまでfetchせず、検索文字列は100文字、300msの待ち時間後に再取得する。追加取得失敗時は既存候補を残す。

- [ ] **Step 5: 詳細ページから管理クライアントと候補組立てを除く**

概要、参加状態、参加人数、直近予定は利用者セッションのRLS/RPCだけで取得する。チャットと招待欄は独立領域にし、片方の失敗で概要を消さない。

- [ ] **Step 6: テストしてコミットする**

```powershell
npm.cmd exec vitest -- run tests/event-detail-performance.test.tsx tests/event-chat.test.tsx tests/event-invite-candidates.test.tsx --no-cache
git add -- app/events/[eventId]/page.tsx app/events/[eventId]/loading.tsx app/api/events/[eventId]/messages/route.ts app/api/events/[eventId]/invite-candidates/route.ts components/event-chat.tsx components/event-invite-candidates.tsx tests/event-detail-performance.test.tsx tests/event-chat.test.tsx tests/event-invite-candidates.test.tsx
git commit -m "perf: stream event detail sections"
```

---

### Task 8: 共通ガード、回数制限、監査ログを追加する

**Files:**
- Create: `tests/supabase/rate-limits-audit.test.ts`
- Create: `supabase/migrations/023_rate_limits_and_security_audit.sql`
- Create: `lib/server/request-guards.ts`
- Create: `lib/server/route-errors.ts`
- Create: `lib/server/rate-limit.ts`
- Create: `lib/server/safe-log.ts`
- Create: `lib/server/admin/cron-notifications.ts`
- Create: `lib/server/admin/public-answer.ts`
- Create: `lib/server/admin/public-invite.ts`
- Create: `lib/server/admin/public-settlement.ts`
- Create: `lib/server/admin/google-token-store.ts`
- Create: `tests/request-guards.test.ts`
- Modify: `app/api/events/[eventId]/availability/route.ts`
- Modify: `app/plans/[planId]/settlement/page.tsx`
- Modify: `lib/actions/answers.ts`
- Modify: `lib/actions/calendar.ts`
- Modify: `lib/actions/connections.ts`
- Modify: `lib/actions/event-members.ts`
- Modify: `lib/actions/event-messages.ts`
- Modify: `lib/actions/events.ts`
- Modify: `lib/actions/plans.ts`
- Modify: `lib/actions/profile.ts`
- Modify: `lib/actions/settlements.ts`
- Modify: `lib/google-calendar/access-token.ts`
- Modify: `app/api/google-calendar/callback/route.ts`
- Modify: `app/api/google-calendar/disconnect/route.ts`

**Interfaces:**
- Produces: `requireUser(): Promise<{ user: User; supabase: SupabaseClient }>`
- Produces: `requireEventAccess(eventId, role): Promise<EventAccess>`
- Produces: `consumeAuthenticatedLimit(operation): Promise<void>`
- Produces: `consumePublicLimit(operation, token): Promise<void>`
- Produces: `RateLimitError { retryAfterSeconds: number }`
- Produces: `toRouteError(error): NextResponse`。回数超過は429と`Retry-After`を返す。
- Produces: `post_event_message(p_event_id uuid, p_body text) returns uuid`
- Produces: `create_event_user_invitations(p_event_id uuid, p_invitee_user_ids uuid[]) returns integer`
- Produces: `respond_event_user_invitation(p_invitation_id uuid, p_response text) returns uuid`

- [ ] **Step 1: DB契約とガードの失敗テストを書く**

023テストはprivateテーブル、本文・token・cookie・ip列がないこと、操作別上限、90日削除関数を検査する。ガードテストは不正UUID=400相当、未認証=401、非所有者=403、上限超過=`RateLimitError`を検査する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/supabase/rate-limits-audit.test.ts tests/request-guards.test.ts --no-cache`

Expected: ファイル未作成でFAIL。

- [ ] **Step 3: 023を実装する**

```sql
create table private.rate_limit_buckets (
  operation text not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (operation, subject_hash, window_started_at)
);

create table private.security_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  operation text not null,
  target_type text not null,
  target_id uuid,
  outcome text not null check (outcome in ('success', 'denied')),
  created_at timestamptz not null default now()
);
```

公開RPCは`consume_authenticated_rate_limit(operation text)`、`consume_public_rate_limit(operation text, subject_hash bytea)`、`record_security_audit(...)`、`purge_expired_security_data()`とする。操作名を固定列挙し、上限を設計書の値へ正規化する。公開用は`service_role`だけ、認証用は`authenticated`だけへ実行権限を与える。

- [ ] **Step 4: TypeScript共通処理を実装する**

公開トークンは次でHMAC化し、生値をDBへ渡さない。性能計測の未ログイン利用者には、ランダム値をHttpOnly・SameSite=Lax Cookieへ入れ、その値のHMACだけを回数制限へ使う。

```ts
createHmac("sha256", process.env.RATE_LIMIT_HMAC_SECRET!)
  .update(`${operation}:${token}`)
  .digest("hex");
```

`safeLog`は`operation`、`code`、`status`、`durationMs`だけを受ける型にし、任意オブジェクトやError本体を引数に取らない。

- [ ] **Step 5: 対象Actionへ順に適用する**

チャット20/60秒、Google空き状況6/60秒、フォロー・招待・ブロック30/60秒、イベント・日程・プロフィール更新30/60秒、公開回答・公開支払い10/60秒を適用する。上限判定はDB更新前に行い、監査対象操作は成功または拒否を記録する。

管理クライアントを使う必要が残る処理は`lib/server/admin/`の小さな関数へ移す。各関数は検証済みのIDまたはトークンだけを受け、Supabaseクライアント自体を返さない。通常の可用性API、清算ページ、ログイン済みActionは利用者セッションと用途別RPCへ切り替える。招待作成・返答とチャット投稿は上記の原子的RPCへ移し、権限判定、更新、監査を同じトランザクションで行う。Google連携完了・解除も成功時に監査RPCを呼ぶ。最後にTask 1の許可リストテストを通し、許可外利用を0件にする。

- [ ] **Step 6: 対象テストと全Actionテストを通す**

Run: `npm.cmd exec vitest -- run tests/supabase/rate-limits-audit.test.ts tests/request-guards.test.ts tests/admin-client-allowlist.test.ts tests/actions --no-cache`

Expected: 全件PASS。

- [ ] **Step 7: コミットする**

```powershell
git add -- supabase/migrations/023_rate_limits_and_security_audit.sql tests/supabase/rate-limits-audit.test.ts tests/request-guards.test.ts tests/admin-client-allowlist.test.ts lib/server app/api/events/[eventId]/availability/route.ts app/plans/[planId]/settlement/page.tsx lib/actions lib/google-calendar/access-token.ts
git commit -m "security: add guards rate limits and audit logs"
```

---

### Task 9: CSP、主要ヘッダー、Cron認証を強制する

**Files:**
- Modify: `middleware.ts`
- Modify: `next.config.ts`
- Modify: `app/api/cron/notifications/route.ts`
- Create: `app/api/cron/retention/route.ts`
- Create: `tests/middleware-security.test.ts`
- Create: `tests/cron-auth.test.ts`

**Interfaces:**
- Produces: `buildContentSecurityPolicy({ nonce, isDevelopment, supabaseUrl }): string`
- Produces: `isAuthorizedCron(request): boolean`

- [ ] **Step 1: ヘッダーとCronの失敗テストを書く**

CSPテストはリクエストごとに異なるnonce、`frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'self'`、本番の`unsafe-eval`不在、`CSP_REPORT_ONLY=true`時のReport-Onlyヘッダーを検査する。Cronテストは本番で秘密値未設定、誤値、User-Agentだけを401、正しいBearerだけを200とする。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/middleware-security.test.ts tests/cron-auth.test.ts --no-cache`

Expected: CSP未実装とUser-Agent代替認証によりFAIL。

- [ ] **Step 3: Middlewareへnonce CSPを実装する**

```ts
const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
const requestHeaders = new Headers(request.headers);
requestHeaders.set("x-nonce", nonce);
requestHeaders.set("Content-Security-Policy", csp);
```

レスポンスにも同じCSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=(self)`を付ける。`CSP_REPORT_ONLY=true`のプレビューでは`Content-Security-Policy-Report-Only`、本番では`Content-Security-Policy`を使う。APIと公開パスは認証DB照会を省略するが、ヘッダーは必ず付ける。

- [ ] **Step 4: Cron認証を強制する**

```ts
function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
```

失敗時ログは`safeLog({ operation: "cron.notifications", code: "unauthorized", status: 401 })`だけとする。

同じ認証関数を`app/api/cron/retention/route.ts`でも使い、`purge_expired_security_data`と`purge_expired_web_vitals`を順に呼ぶ。片方が失敗した場合は処理名とDBエラーコードだけを記録し、秘密値や削除対象行を出力しない。

- [ ] **Step 5: テストしてコミットする**

```powershell
npm.cmd exec vitest -- run tests/middleware-security.test.ts tests/cron-auth.test.ts tests/next-config.test.ts --no-cache
git add -- middleware.ts next.config.ts app/api/cron/notifications/route.ts app/api/cron/retention/route.ts tests/middleware-security.test.ts tests/cron-auth.test.ts tests/next-config.test.ts
git commit -m "security: enforce browser headers and cron secret"
```

---

### Task 10: 少量のWeb Vitalsとサーバー時間を記録する

**Files:**
- Create: `tests/supabase/performance-measurements.test.ts`
- Create: `supabase/migrations/024_performance_measurements.sql`
- Create: `lib/server/timing.ts`
- Create: `app/api/performance/vitals/route.ts`
- Create: `components/web-vitals-reporter.tsx`
- Modify: `app/layout.tsx`
- Create: `tests/web-vitals.test.tsx`

**Interfaces:**
- Produces: `WebVitalInput = { page: PageTemplate; name: "LCP" | "INP" | "CLS"; value: number; device: "mobile" | "desktop" }`
- Produces: `PageTemplate = "home" | "events" | "event-detail" | "calendar" | "connections" | "other"`

- [ ] **Step 1: 非識別性と5%サンプルの失敗テストを書く**

DBテストは利用者ID、URL、query、event、token列が存在しないことと30日削除を検査する。部品テストは`Math.random() >= 0.05`で送信しないこと、許可した指標と画面名だけ送ることを検査する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/supabase/performance-measurements.test.ts tests/web-vitals.test.tsx --no-cache`

Expected: ファイル未作成でFAIL。

- [ ] **Step 3: 024と受付APIを実装する**

```sql
create table private.web_vital_samples (
  id bigint generated always as identity primary key,
  page_template text not null,
  metric_name text not null check (metric_name in ('LCP', 'INP', 'CLS')),
  metric_value double precision not null,
  device_class text not null check (device_class in ('mobile', 'desktop')),
  created_at timestamptz not null default now()
);
```

`record_web_vital`と30日削除RPCは`service_role`だけへ許可する。受付APIは本文1KB以下、Zod検証、回数制限、204応答とし、完全URLを参照しない。

- [ ] **Step 4: ReporterとServer-Timingを実装する**

`WebVitalsReporter`は`useReportWebVitals`を使い、初回に決めた5%サンプル対象だけ`navigator.sendBeacon`で送る。`timed(operation, fn)`は時間を計り、`safeLog`へ操作名とmsだけ渡す。

- [ ] **Step 5: テストしてコミットする**

```powershell
npm.cmd exec vitest -- run tests/supabase/performance-measurements.test.ts tests/web-vitals.test.tsx --no-cache
git add -- supabase/migrations/024_performance_measurements.sql tests/supabase/performance-measurements.test.ts lib/server/timing.ts app/api/performance/vitals/route.ts components/web-vitals-reporter.tsx app/layout.tsx tests/web-vitals.test.tsx
git commit -m "perf: sample non-identifying web vitals"
```

---

### Task 11: 大量データと3秒基準を自動検証する

**Files:**
- Create: `scripts/performance/safety.mjs`
- Create: `scripts/performance/seed-large-dataset.mjs`
- Create: `scripts/performance/benchmark-rpcs.mjs`
- Create: `scripts/performance/run-lighthouse.mjs`
- Create: `tests/performance-script-safety.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `assertSafePerformanceTarget(env): void`
- Produces: JSON結果 `artifacts/performance/rpc-benchmark.json` と `artifacts/performance/lighthouse.json`。

- [ ] **Step 1: 本番誤実行を止める失敗テストを書く**

localhostは許可、`PERF_SUPABASE_URL`未指定は拒否、`NEXT_PUBLIC_SUPABASE_URL`と一致は拒否、明示した検証プロジェクトref不一致は拒否、とする。

- [ ] **Step 2: 失敗を確認する**

Run: `npm.cmd exec vitest -- run tests/performance-script-safety.test.ts --no-cache`

Expected: safetyモジュール未作成でFAIL。

- [ ] **Step 3: データ生成とRPC計測を実装する**

生成データはタイトル先頭を`[perf:<RUN_ID>]`に固定し、所有イベント1万件、つながり候補5千人、日程関連合計1万件以上、メッセージ1万件をバッチ500件で投入する。削除は同じ`RUN_ID`のID一覧だけを対象にする。

RPC計測は各RPCを20回実行し、返却件数上限とp50/p95をJSONへ保存する。p95が1000ms超、一覧21件以上、メッセージ51件以上なら終了コード1にする。

- [ ] **Step 4: Lighthouse計測を実装する**

開発依存へ`lighthouse`を追加し、`--throttling-method=simulate`、CPU slowdown 4、低速4G相当を固定する。ログイン済み検証プロファイルで`/connections`、`/plans`、代表イベント詳細を3回ずつ測り、主要部分のLCPが3000msを超えたら終了コード1にする。開発依存なので本番バンドルへ含めない。

- [ ] **Step 5: npmスクリプトを追加する**

```json
"perf:seed": "node scripts/performance/seed-large-dataset.mjs",
"perf:rpc": "node scripts/performance/benchmark-rpcs.mjs",
"perf:lighthouse": "node scripts/performance/run-lighthouse.mjs"
```

- [ ] **Step 6: 安全テストを通してコミットする**

```powershell
npm.cmd exec vitest -- run tests/performance-script-safety.test.ts --no-cache
git add -- scripts/performance tests/performance-script-safety.test.ts package.json package-lock.json .env.example
git commit -m "test: add guarded large-data performance checks"
```

---

### Task 12: 旧補助関数への依存をなくし、全体を検証する

**Files:**
- Create: `tests/legacy-helper-usage.test.ts`
- Verify: `app/`、`components/`、`lib/`、`tests/`、`supabase/migrations/`

**Interfaces:**
- Consumes: Tasks 1〜11の成果物。
- Produces: 旧`public.is_*`、`public.have_shared_event`を直接呼ばないアプリ。

- [ ] **Step 1: 旧関数参照が残っていないことをテストする**

TypeScriptソースに`.rpc("is_event_owner"`、`.rpc("is_joined_event_member"`、`.rpc("have_shared_event"`、`.rpc("is_user_blocked"`、`.rpc("is_following"`がないことを検査する。SQLポリシーは`private.*`だけを参照することを検査する。このテストにより、後続の旧関数削除を安全に行える状態を固定する。

- [ ] **Step 2: 対象テストをまとめて実行する**

```powershell
npm.cmd exec vitest -- run tests/supabase/function-privileges.test.ts tests/supabase/page-query-performance.test.ts tests/supabase/rate-limits-audit.test.ts tests/supabase/performance-measurements.test.ts tests/admin-client-allowlist.test.ts tests/legacy-helper-usage.test.ts tests/connections-page-performance.test.ts tests/plans-page-month-scope.test.ts tests/event-detail-performance.test.tsx tests/middleware-security.test.ts tests/cron-auth.test.ts tests/web-vitals.test.tsx --no-cache
```

Expected: 全件PASS。

- [ ] **Step 3: 全テスト、Lint、型検査、本番ビルドを実行する**

```powershell
npm.cmd exec vitest -- run --no-cache
npm.cmd run lint
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```

Expected: すべて終了コード0。

- [ ] **Step 4: 差分の衛生状態を確認する**

```powershell
git diff --check
git status --short
```

Expected: `git diff --check`は出力なし。未追跡ファイルは本計画に記載したものだけ。

- [ ] **Step 5: 依存除去テストをコミットする**

```powershell
git add -- tests/legacy-helper-usage.test.ts
git commit -m "test: prevent legacy helper reuse"
```

---

## Release Runbook

- [ ] **Step 1: 検証DBへ021を適用し、anonが全対象で401または403になることを実測する**
- [ ] **Step 2: 検証DBへ022〜024を適用し、RPC上限、越権拒否、429、監査の非識別性を実測する**
- [ ] **Step 3: 大量データ生成、RPCベンチマーク、Lighthouseを検証環境で通す**
- [ ] **Step 4: `CSP_REPORT_ONLY=true`のVercelプレビューで違反を確認し、Googleログイン、Google Calendar、共有回答、清算、通知を確認する**
- [ ] **Step 5: 320px、375px、390pxで固定下部ナビ、分類変更、追加取得、再試行を確認する**
- [ ] **Step 6: 021〜024を本番DBへ適用し、同じ権限・件数・監査確認を行う**
- [ ] **Step 7: `CSP_REPORT_ONLY`を外して強制CSPにし、アプリをmainへ反映して本番主要画面とGoogle連携を確認する**
- [ ] **Step 8: 新アプリの正常動作を確認した後、`2026-07-19-legacy-security-helper-cleanup.md`を別の変更として実行する**

問題が出た場合はアプリを前版へ戻す。021〜024は追加型で旧補助関数も認証済み・service_role限定で残るため、旧アプリへ安全に戻せる。
