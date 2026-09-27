# つながりのグループ PR② 実装計画（グループ画面のイベント）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グループ画面 `/connections/groups/[groupId]` に、メンバーが1人でも参加しているイベントを出す。進行中はすべて、おわったもの（完了・中止）は最新5件を折りたたみで。

**Architecture:** migration 055 で RPC `list_connection_group_events` を1つ足す（進行中すべて＋おわった最新5件を1回で返す）。画面はサーバーコンポーネント `ConnectionGroupEvents` を新しく作り、グループ画面のページで既存の RPC と並列に読む。

**Tech Stack:** Next.js 15 App Router / Supabase（Postgres 16、RPC）/ Tailwind / Vitest（jsdom・DB）

**設計:** `docs/superpowers/specs/2026-09-25-connection-groups-design.md`（「グループ画面」「性能」）

## Global Constraints

- 出すイベント: 自分が参加（`joined`）していて、グループのメンバーが1人以上参加（`joined`）しているもの
- 進行中・おわったの区別は `public.event_activity_state.is_active`（migration 050）に合わせる。清算待ちは進行中に入る
- 進行中はすべて、開催日（`start_date`）の早い順（日付なしは最後）。おわったものは最新5件（`coalesce(end_date, start_date)` の新しい順）
- 重なりは「グループの人数中、そのイベントに参加しているメンバーの人数」（例「3人中2人」）。数えるメンバーは、ブロック関係・退会済み・退会処理中の人を除く（`private.is_connection_group_member_visible`、migration 053）
- 他人のグループ・存在しないグループでは空を返す（画面は既存どおり404）
- 状態の表示は `eventDisplayStateLabels`（`lib/domain/event/event-filter.ts`）を使う
- 新しい RPC は `security definer`、`set search_path = ''`、`public` と `anon` から実行権を剥がし、`authenticated` と `service_role` に付与する
- 本番 DB への適用は、そのたびにユーザーの承認を得てから、ユーザーが実行する（Claude の実行は自動許可判定で止まる）

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `supabase/migrations/055_connection_group_events.sql`（新規） | RPC `list_connection_group_events` |
| `tests/db/connection-group-events.test.ts`（新規） | 上の DB テスト |
| `lib/domain/account/connection-groups.ts`（変更） | 型 `ConnectionGroupEvent` と変換 |
| `tests/account/connection-groups.test.ts`（変更） | 変換のテスト |
| `components/account/connection-group-events.tsx`（新規） | 進行中の一覧と、おわったものの折りたたみ |
| `tests/account/connection-group-events.test.tsx`（新規） | 上のテスト |
| `app/connections/groups/[groupId]/page.tsx`（変更） | イベントを並列に読み、表示する |
| `tests/account/connection-group-page.test.tsx`（変更） | RPC の呼び出しのテスト |
| `lib/supabase/database.types.ts`（再生成） | 055 を本番に適用したあとに再生成 |

---

### Task 1: migration 055 と DB テスト

**Files:**
- Create: `supabase/migrations/055_connection_group_events.sql`
- Test: `tests/db/connection-group-events.test.ts`

**Interfaces:**
- Produces（SQL）: `public.list_connection_group_events(p_group_id uuid) returns table(event_id uuid, title text, display_state text, is_active boolean, member_count bigint, group_member_count bigint)`。並びは「進行中 → おわった」の順

- [ ] **Step 1: DB テストを書く（失敗するもの）**

`tests/db/connection-group-events.test.ts`（先頭のヘルパーは `tests/db/connection-groups.test.ts:1-78` と同じもの。`client`・`makeUser`・`makeEvent`・`joinEvent`・`shareEvent`・`asUser`・`createGroup`・`beforeAll`〜`afterEach` をそのまま写す。`makeEvent` は開催日を渡せるように次の形にする）:

```ts
async function makeEvent(
  ownerId: string,
  options: { status?: string; startDate?: string; endDate?: string; title?: string } = {}
) {
  const eventId = randomUUID();
  const startDate = options.startDate ?? "2099-01-01";
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,$3,$4,$5,$6)",
    [eventId, ownerId, options.title ?? "会", options.status ?? "confirmed", startDate, options.endDate ?? startDate]
  );
  return eventId;
}

async function eventsOf(groupId: string) {
  const { rows } = await client.query(
    "select title, display_state, is_active, member_count, group_member_count from public.list_connection_group_events($1)",
    [groupId]
  );
  return rows;
}

describe("list_connection_group_events", () => {
  it("メンバーが1人でも参加しているイベントを、重なりの人数つきで返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const outsider = await makeUser();
    const both = await makeEvent(me, { title: "2人とも", startDate: "2099-02-01" });
    for (const user of [me, aya, ken]) await joinEvent(both, user);
    const onlyAya = await makeEvent(me, { title: "あやだけ", startDate: "2099-01-01" });
    for (const user of [me, aya]) await joinEvent(onlyAya, user);
    const noMember = await makeEvent(me, { title: "メンバーなし" });
    for (const user of [me, outsider]) await joinEvent(noMember, user);
    const withoutMe = await makeEvent(aya, { title: "自分は不参加" });
    await joinEvent(withoutMe, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya, ken]);

    expect(await eventsOf(groupId)).toEqual([
      { title: "あやだけ", display_state: expect.any(String), is_active: true, member_count: "1", group_member_count: "2" },
      { title: "2人とも", display_state: expect.any(String), is_active: true, member_count: "2", group_member_count: "2" }
    ]);
  });

  it("おわったイベントは進行中のあとに、新しい順で5件まで返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const active = await makeEvent(me, { title: "進行中" });
    for (const user of [me, aya]) await joinEvent(active, user);
    for (let i = 1; i <= 6; i += 1) {
      const day = String(i).padStart(2, "0");
      const done = await makeEvent(me, { title: `おわり${i}`, status: "done", startDate: `2020-01-${day}` });
      for (const user of [me, aya]) await joinEvent(done, user);
    }
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya]);

    const rows = await eventsOf(groupId);
    expect(rows.map((row) => row.title)).toEqual(["進行中", "おわり6", "おわり5", "おわり4", "おわり3", "おわり2"]);
    expect(rows.map((row) => row.is_active)).toEqual([true, false, false, false, false, false]);
  });

  it("ブロック関係の人・退会した人は重なりにもグループの人数にも数えない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const blocked = await makeUser();
    const withdrawn = await makeUser();
    const eventId = await makeEvent(me);
    for (const user of [me, aya, blocked, withdrawn]) await joinEvent(eventId, user);
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya, blocked, withdrawn]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);
    await client.query("update public.profiles set deleted_at = now(), deletion_state = 'pending' where user_id = $1", [
      withdrawn
    ]);

    expect(await eventsOf(groupId)).toEqual([
      { title: "会", display_state: expect.any(String), is_active: true, member_count: "1", group_member_count: "1" }
    ]);
  });

  it("他人のグループは空で返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya]);

    await asUser(other);
    expect(await eventsOf(groupId)).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

ブランチを push し、PR の CI（`db-tests`）で `function public.list_connection_group_events(unknown) does not exist` で落ちることを確かめる（ローカルに Postgres がないため）。

- [ ] **Step 3: migration を書く**

`supabase/migrations/055_connection_group_events.sql`:

```sql
-- グループ画面の「進めているイベント」と「最近おわったイベント」。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md

begin;

create function public.list_connection_group_events(p_group_id uuid)
returns table(
  event_id uuid,
  title text,
  display_state text,
  is_active boolean,
  member_count bigint,
  group_member_count bigint
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

  if not exists (
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = v_actor
  ) then
    return;
  end if;

  return query
  with visible_members as (
    select member.member_user_id
    from public.connection_group_members as member
    where member.group_id = p_group_id
      and private.is_connection_group_member_visible(v_actor, member.member_user_id)
  ),
  shared as (
    select mine.event_id, count(distinct theirs.user_id)::bigint as member_count
    from public.event_members as mine
    join public.event_members as theirs
      on theirs.event_id = mine.event_id
      and theirs.status = 'joined'
    join visible_members
      on visible_members.member_user_id = theirs.user_id
    where mine.user_id = v_actor
      and mine.status = 'joined'
    group by mine.event_id
  ),
  group_events as (
    select
      e.id,
      e.title,
      activity.display_state,
      activity.is_active,
      shared.member_count,
      e.start_date,
      e.end_date,
      e.created_at
    from shared
    join public.events as e on e.id = shared.event_id
    join public.event_activity_state as activity on activity.event_id = e.id
  ),
  finished_events as (
    select group_events.*
    from group_events
    where not group_events.is_active
    order by coalesce(group_events.end_date, group_events.start_date) desc nulls last, group_events.created_at desc
    limit 5
  ),
  picked as (
    select group_events.*, 0 as bucket from group_events where group_events.is_active
    union all
    select finished_events.*, 1 as bucket from finished_events
  )
  select
    picked.id,
    picked.title,
    picked.display_state,
    picked.is_active,
    picked.member_count,
    (select count(*) from visible_members)::bigint
  from picked
  order by
    picked.bucket,
    case when picked.bucket = 0 then picked.start_date end asc nulls last,
    case when picked.bucket = 1 then coalesce(picked.end_date, picked.start_date) end desc nulls last,
    picked.created_at desc;
end;
$$;

revoke all on function public.list_connection_group_events(uuid) from public;
revoke all on function public.list_connection_group_events(uuid) from anon;
grant execute on function public.list_connection_group_events(uuid) to authenticated;
grant execute on function public.list_connection_group_events(uuid) to service_role;

commit;
```

- [ ] **Step 4: 通ることを確認する**

push して CI の `db-tests` がすべて通ることを確かめる。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/055_connection_group_events.sql tests/db/connection-group-events.test.ts
git commit -m "feat(db): グループのメンバーが参加しているイベントを返す RPC を足す（migration 055）"
```

---

### Task 2: 【止まって確認】055 を本番に適用し、型を再生成する

055 は関数を1つ足すだけで、今の画面の動きは変えない。

- [ ] **Step 1: ユーザーに承認を求め、実行してもらう**

`verifying-db-migrations` に従い、次のコマンドをユーザーに `!` で実行してもらう:

```
! npx supabase db query --linked --project-ref esheopszeqggftmawdmu -f supabase/migrations/055_connection_group_events.sql
```

- [ ] **Step 2: 適用を確かめる**

`has_function_privilege('authenticated', 'public.list_connection_group_events(uuid)', 'execute')` が true、`anon` が false であることを読み取りのクエリで確かめる。

- [ ] **Step 3: 型を再生成してコミット**

Run: `npx supabase gen types typescript --project-id esheopszeqggftmawdmu --schema public > lib/supabase/database.types.ts`
Expected: `list_connection_group_events` だけが増える（`git diff --stat` で確認）。`npx tsc --noEmit` が通る。

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(supabase): migration 055 適用後の型を再生成する"
```

---

### Task 3: 型と変換、イベントの一覧、ページの読み込み

**Files:**
- Modify: `lib/domain/account/connection-groups.ts`
- Create: `components/account/connection-group-events.tsx`
- Modify: `app/connections/groups/[groupId]/page.tsx`
- Test: `tests/account/connection-groups.test.ts`、`tests/account/connection-group-events.test.tsx`（新規）、`tests/account/connection-group-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 の RPC
- Produces:
  - `type ConnectionGroupEvent = { eventId: string; title: string; displayState: EventDisplayState; isActive: boolean; memberCount: number; groupMemberCount: number }`
  - `mapConnectionGroupEventRow(row: { event_id: string; title: string; display_state: string; is_active: boolean; member_count: number | string; group_member_count: number | string }): ConnectionGroupEvent`
  - `ConnectionGroupEvents({ events }: { events: ConnectionGroupEvent[] })`

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/connection-groups.test.ts` の `describe("mappers", ...)` に足す（import に `mapConnectionGroupEventRow` を足す）:

```ts
  it("イベントの行を変換する", () => {
    expect(
      mapConnectionGroupEventRow({
        event_id: "e1",
        title: "謎解き 秋公演",
        display_state: "answer_waiting",
        is_active: true,
        member_count: "2",
        group_member_count: "3"
      })
    ).toEqual({
      eventId: "e1",
      title: "謎解き 秋公演",
      displayState: "answer_waiting",
      isActive: true,
      memberCount: 2,
      groupMemberCount: 3
    });
  });
```

`tests/account/connection-group-events.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionGroupEvents } from "@/components/account/connection-group-events";
import type { ConnectionGroupEvent } from "@/lib/domain/account/connection-groups";

const active: ConnectionGroupEvent = {
  eventId: "e1",
  title: "謎解き 秋公演",
  displayState: "answer_waiting",
  isActive: true,
  memberCount: 2,
  groupMemberCount: 3
};
const done = (index: number): ConnectionGroupEvent => ({
  eventId: `d${index}`,
  title: `おわった会${index}`,
  displayState: "completed",
  isActive: false,
  memberCount: 1,
  groupMemberCount: 3
});

describe("ConnectionGroupEvents", () => {
  it("進行中のイベントを、状態と重なりの人数つきのリンクで並べる", () => {
    render(<ConnectionGroupEvents events={[active]} />);
    expect(screen.getByRole("heading", { name: "進めているイベント" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /謎解き 秋公演/ });
    expect(link).toHaveAttribute("href", "/events/e1");
    expect(link).toHaveTextContent("回答待ち");
    expect(link).toHaveTextContent("3人中2人");
  });

  it("おわったイベントは件数つきの折りたたみに入れ、はじめは閉じておく", () => {
    const { container } = render(<ConnectionGroupEvents events={[active, done(1), done(2)]} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const summary = within(details as HTMLElement).getByText("最近おわったイベント 2件");
    fireEvent.click(summary);
    expect(within(details as HTMLElement).getByRole("link", { name: /おわった会1/ })).toHaveTextContent("完了");
  });

  it("進行中がないときは説明を出し、おわったものがなければ折りたたみを出さない", () => {
    const { container } = render(<ConnectionGroupEvents events={[]} />);
    expect(screen.getByText("このグループの人と進めているイベントはありません。")).toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });
});
```

`tests/account/connection-group-page.test.tsx` に足す（`vi.mock("@/components/account/connection-group-events", () => ({ ConnectionGroupEvents: () => null }))` をほかの `vi.mock` の並びに足す）:

```tsx
  it("グループとメンバーとイベントを並列に読む", async () => {
    const rpc = vi.fn((name: string) => {
      if (name === "get_connection_group") {
        return Promise.resolve({
          data: [{ group_id: groupId, name: "謎解き仲間", color: "nazotoki", member_count: 1, created_at: "2026-09-27T00:00:00Z" }],
          error: null
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    createSupabaseServerClient.mockResolvedValue({ rpc });

    await ConnectionGroupPage({ params: Promise.resolve({ groupId }) });

    expect(rpc).toHaveBeenCalledWith("get_connection_group", { p_group_id: groupId });
    expect(rpc).toHaveBeenCalledWith("list_connection_group_members", { p_group_id: groupId });
    expect(rpc).toHaveBeenCalledWith("list_connection_group_events", { p_group_id: groupId });
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account/connection-groups.test.ts tests/account/connection-group-events.test.tsx tests/account/connection-group-page.test.tsx`
Expected: FAIL（`mapConnectionGroupEventRow` がない、`connection-group-events` がない、`list_connection_group_events` を呼んでいない）

- [ ] **Step 3: 型と変換を足す**

`lib/domain/account/connection-groups.ts` の先頭に `import type { EventDisplayState } from "@/lib/domain/event/event-filter";` を足し、末尾に次を足す:

```ts
export type ConnectionGroupEvent = {
  eventId: string;
  title: string;
  displayState: EventDisplayState;
  isActive: boolean;
  /** このイベントに参加しているグループのメンバーの人数。 */
  memberCount: number;
  /** グループの人数（ブロック関係・退会した人を除く）。 */
  groupMemberCount: number;
};

type ConnectionGroupEventRpcRow = {
  event_id: string;
  title: string;
  display_state: string;
  is_active: boolean;
  member_count: number | string;
  group_member_count: number | string;
};

export function mapConnectionGroupEventRow(row: ConnectionGroupEventRpcRow): ConnectionGroupEvent {
  return {
    eventId: row.event_id,
    title: row.title,
    displayState: row.display_state as EventDisplayState,
    isActive: row.is_active,
    memberCount: Number(row.member_count),
    groupMemberCount: Number(row.group_member_count)
  };
}
```

- [ ] **Step 4: イベントの一覧を作る**

`components/account/connection-group-events.tsx`（サーバーコンポーネント。`"use client"` は付けない）:

```tsx
import Link from "next/link";
import React from "react";

import type { ConnectionGroupEvent } from "@/lib/domain/account/connection-groups";
import { eventDisplayStateLabels } from "@/lib/domain/event/event-filter";

function EventLink({ event }: { event: ConnectionGroupEvent }) {
  return (
    <Link
      href={`/events/${event.eventId}`}
      className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
    >
      <span className="min-w-0 truncate font-bold text-ink">{event.title}</span>
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted">
        <span>
          {event.groupMemberCount}人中{event.memberCount}人
        </span>
        <span aria-hidden="true">・</span>
        <span>{eventDisplayStateLabels[event.displayState]}</span>
      </span>
    </Link>
  );
}

export function ConnectionGroupEvents({ events }: { events: ConnectionGroupEvent[] }) {
  const active = events.filter((event) => event.isActive);
  const finished = events.filter((event) => !event.isActive);

  return (
    <section aria-labelledby="connection-group-events-heading" className="grid gap-3">
      <h2 id="connection-group-events-heading" className="text-xl font-semibold text-ink">
        進めているイベント
      </h2>
      {active.length === 0 ? (
        <p className="text-sm text-muted">このグループの人と進めているイベントはありません。</p>
      ) : (
        <ul className="grid gap-2">
          {active.map((event) => (
            <li key={event.eventId}>
              <EventLink event={event} />
            </li>
          ))}
        </ul>
      )}

      {finished.length > 0 ? (
        <details className="rounded-control border border-line bg-sunken">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-body font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay [&::-webkit-details-marker]:hidden">
            最近おわったイベント {finished.length}件
          </summary>
          <ul className="grid gap-2 px-3 pb-3">
            {finished.map((event) => (
              <li key={event.eventId}>
                <EventLink event={event} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: ページで読み込んで出す**

`app/connections/groups/[groupId]/page.tsx`:
- import に `ConnectionGroupEvents` と `mapConnectionGroupEventRow` を足す
- `Promise.all` に `supabase.rpc("list_connection_group_events", { p_group_id: groupId })` を足し、結果を `eventsResult` で受ける。エラーの判定にも `eventsResult.error` を足す
- `const events = (eventsResult.data ?? []).map(mapConnectionGroupEventRow);`
- 戻り値を次にする:

```tsx
  return (
    <div className="grid gap-8">
      <ConnectionGroupDetail group={group} members={members} />
      <ConnectionGroupEvents events={events} />
    </div>
  );
```

- [ ] **Step 6: 通ることを確認する**

Run: `npx vitest run tests/account && npx tsc --noEmit && npx eslint app/connections components/account lib/domain/account`
Expected: PASS、型・lint のエラーなし

- [ ] **Step 7: コミット**

```bash
git add lib/domain/account/connection-groups.ts components/account/connection-group-events.tsx "app/connections/groups/[groupId]/page.tsx" tests/account
git commit -m "feat(connections): グループ画面に進めているイベントと最近おわったイベントを出す"
```

---

### Task 4: 検証と PR

- [ ] **Step 1: 全テスト・型・lint・build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: すべて成功。件数を記録する。

- [ ] **Step 2: アクセシビリティ**

`accessibility` を通す（リンクの読み上げ名に題名・重なり・状態が入ること、折りたたみがキーボードで開閉できること）。

- [ ] **Step 3: レビューと PR**

Codex（Sol / high）の PR 前レビュー → 指摘の裏取りと対応 → PR を作る。055 は Task 2 で本番適用済みなので、マージ後の DB 作業はない。

- [ ] **Step 4: 本番の確認をユーザーに頼む（まとめての確認でよい）**

- どの画面: スマホでグループ画面を開く（メンバーと一緒に参加しているイベントがあるグループ）
- 見るもの: 「進めているイベント」に、題名・「○人中○人」・状態が出ている。押すとイベントの画面に進む。おわったイベントがあれば「最近おわったイベント ○件」を押すと開く
- NG: メンバーが参加していないイベントが出る／人数がおかしい／ブロックした人が数に入っている
