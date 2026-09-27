# つながりのグループ PR③ 実装計画（招待のグループボタン）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント詳細の「Madoiで招待」で、グループのボタンを押すと、そのグループのうち招待できる人にまとめてチェックが入るようにする。

**Architecture:** migration 056 で、イベントに招待できるグループのメンバーを一括で返す RPC `list_event_group_invitees` を足し、招待を送る `create_event_user_invitations` の人数の上限を20人から30人（グループの上限）に上げる。画面は既存の `EventInviteCandidates` にグループのボタンの行を足し、ページで既存の候補と並列に読む。

**Tech Stack:** Next.js 15 App Router / Supabase（Postgres 16、RPC）/ Tailwind / Vitest（jsdom・DB）

**設計:** `docs/superpowers/specs/2026-09-25-connection-groups-design.md`（「招待」）

## Global Constraints

- グループの「招待できる人」: そのグループのメンバーのうち、ブロック関係・退会済み・退会処理中でなく（`private.is_connection_group_member_visible`、migration 053）、招待の条件（一緒に参加したことがある、またはフォロー中）を満たし、そのイベントにまだ参加しておらず（`joined`）、保留中・承諾済みの招待（`pending` / `accepted`）もない人
- 呼べるのはイベントの主催者だけ（`list_event_invite_candidates` と同じく、主催者でなければ例外）
- メンバーが0人のグループはボタンを出さない。メンバーはいるが招待できる人が0人のグループは、押せない表示で「全員参加済み・招待済み」と出す
- グループを1つも作っていない（ボタンにするグループがない）ときは、ボタンの行を出さない
- 候補一覧は20件ずつ読み込むので、グループのボタンでまだ読み込んでいない人にもチェックが入るようにし、チェックした人は一覧の先頭に出す
- 送るボタンの文言は、選んだ人がいれば「3人に招待を送る」、いなければ今の「Madoiで招待を送る」
- 招待を一度に送れる人数の上限は30人（`create_event_user_invitations`）。ほかの条件（主催者・ブロック・参加済み・招待済み・回数制限）は変えない
- 新しい RPC は `security definer`、`set search_path = ''`、`public` と `anon` から実行権を剥がし、`authenticated` と `service_role` に付与する
- 本番 DB への適用は、そのたびにユーザーの承認を得てから、ユーザーが実行する

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `supabase/migrations/056_event_group_invitees.sql`（新規） | RPC `list_event_group_invitees`、`create_event_user_invitations` の上限を30人に |
| `tests/db/event-group-invitees.test.ts`（新規） | 上の DB テスト |
| `lib/domain/account/connection-groups.ts`（変更） | 型 `EventInviteGroup` と、RPC 行からの組み立て |
| `tests/account/connection-groups.test.ts`（変更） | 組み立てのテスト |
| `components/event/event-invite-candidates.tsx`（変更） | グループのボタンの行、選んだ人を先頭に、送るボタンの文言 |
| `tests/event/event-invite-candidates.test.tsx`（変更） | 上のテスト |
| `app/events/[eventId]/page.tsx`（変更） | グループの招待できる人を並列に読む |
| `tests/event/event-detail-data-loading.test.ts`（変更） | 読み込みのテスト |
| `lib/supabase/database.types.ts`（再生成） | 056 を本番に適用したあとに再生成 |

---

### Task 1: migration 056 と DB テスト

**Files:**
- Create: `supabase/migrations/056_event_group_invitees.sql`
- Test: `tests/db/event-group-invitees.test.ts`

**Interfaces:**
- Produces（SQL）:
  - `public.list_event_group_invitees(p_event_id uuid) returns table(group_id uuid, group_name text, group_color text, group_member_count bigint, user_id uuid, display_name text, shared_event_count bigint, is_following boolean)`。メンバーが1人以上いる自分のグループを作った順に返す。招待できる人がいれば1人1行、いなければ `user_id` などが null の1行
  - `public.create_event_user_invitations(p_event_id uuid, p_invitee_user_ids uuid[]) returns jsonb` の人数の上限を30人に

- [ ] **Step 1: DB テストを書く（失敗するもの）**

`tests/db/event-group-invitees.test.ts`（先頭のヘルパーは `tests/db/connection-groups.test.ts:1-78` の `client`・`makeUser`・`makeEvent`・`joinEvent`・`shareEvent`・`asUser`・`createGroup`・`beforeAll`〜`afterEach` をそのまま写す）:

```ts
async function inviteesOf(eventId: string) {
  const { rows } = await client.query(
    "select group_name, group_member_count, user_id from public.list_event_group_invitees($1)",
    [eventId]
  );
  return rows;
}

describe("list_event_group_invitees", () => {
  it("グループごとに、そのイベントに招待できるメンバーを返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const mio = await makeUser();
    await shareEvent(me, aya, ken, mio);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await joinEvent(target, ken); // 参加済み
    await asUser(me);
    await createGroup("謎解き仲間", "nazotoki", [aya, ken]);
    await createGroup("大学の友達", "boardgame", [mio]);
    await client.query(
      "insert into public.event_user_invitations (event_id, inviter_user_id, invitee_user_id, status) values ($1,$2,$3,'pending')",
      [target, me, mio]
    ); // 招待済み

    expect(await inviteesOf(target)).toEqual([
      { group_name: "謎解き仲間", group_member_count: "2", user_id: aya },
      { group_name: "大学の友達", group_member_count: "1", user_id: null }
    ]);
  });

  it("メンバーが0人のグループは返さない。ブロック関係・退会した人は数えない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, aya, blocked);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);
    await createGroup("空", "honey");
    await createGroup("仲間", "nazotoki", [aya, blocked]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);

    expect(await inviteesOf(target)).toEqual([{ group_name: "仲間", group_member_count: "1", user_id: aya }]);
  });

  it("主催者でなければ呼べない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const target = await makeEvent(other);
    await joinEvent(target, other);
    await asUser(me);
    await client.query("savepoint not_owner");
    await expect(inviteesOf(target)).rejects.toThrow(/Event owner required/);
    await client.query("rollback to savepoint not_owner");
  });
});

describe("create_event_user_invitations の上限", () => {
  it("30人までまとめて送れて、31人は invalid_input", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    const over = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      people
    ]);
    expect(over.rows[0].result).toMatchObject({ ok: false, error: "invalid_input" });

    const ok = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      people.slice(0, 30)
    ]);
    expect(ok.rows[0].result).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

ブランチを push し、CI の `db-tests` で `function public.list_event_group_invitees(unknown) does not exist` と、30人の送信が `invalid_input` になることで落ちるのを確かめる。

- [ ] **Step 3: migration を書く**

`supabase/migrations/056_event_group_invitees.sql`:

1. `begin;` のあとに次の関数:

```sql
-- イベント詳細の「Madoiで招待」で、グループのボタンから招待できる人を出す。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md

create function public.list_event_group_invitees(p_event_id uuid)
returns table(
  group_id uuid,
  group_name text,
  group_color text,
  group_member_count bigint,
  user_id uuid,
  display_name text,
  shared_event_count bigint,
  is_following boolean
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
    select 1 from public.events as owned_event
    where owned_event.id = p_event_id and owned_event.owner_user_id = v_actor
  ) then
    raise exception 'Event owner required';
  end if;

  return query
  with visible_members as (
    select owned.id as group_id, owned.name, owned.color, owned.created_at, member.member_user_id
    from public.connection_groups as owned
    join public.connection_group_members as member on member.group_id = owned.id
    where owned.owner_user_id = v_actor
      and private.is_connection_group_member_visible(v_actor, member.member_user_id)
  ),
  group_sizes as (
    select visible_members.group_id, visible_members.name, visible_members.color, visible_members.created_at,
      count(*)::bigint as member_count
    from visible_members
    group by visible_members.group_id, visible_members.name, visible_members.color, visible_members.created_at
  ),
  invitable as (
    select visible_members.group_id, visible_members.member_user_id
    from visible_members
    where (
        public.have_shared_event(v_actor, visible_members.member_user_id)
        or exists (
          select 1 from public.user_connections as following
          where following.follower_user_id = v_actor
            and following.followed_user_id = visible_members.member_user_id
        )
      )
      and not exists (
        select 1 from public.event_members as joined_member
        where joined_member.event_id = p_event_id
          and joined_member.user_id = visible_members.member_user_id
          and joined_member.status = 'joined'
      )
      and not exists (
        select 1 from public.event_user_invitations as invitation
        where invitation.event_id = p_event_id
          and invitation.invitee_user_id = visible_members.member_user_id
          and invitation.status in ('pending', 'accepted')
      )
  )
  select
    group_sizes.group_id,
    group_sizes.name,
    group_sizes.color,
    group_sizes.member_count,
    invitable.member_user_id,
    case when invitable.member_user_id is null then null
      else private.connection_display_name(invitable.member_user_id) end,
    case when invitable.member_user_id is null then null
      else (
        select count(*)
        from public.event_members as mine
        join public.event_members as theirs
          on theirs.event_id = mine.event_id
          and theirs.status = 'joined'
          and theirs.user_id = invitable.member_user_id
        where mine.user_id = v_actor and mine.status = 'joined'
      )::bigint end,
    case when invitable.member_user_id is null then null
      else exists (
        select 1 from public.user_connections as following
        where following.follower_user_id = v_actor
          and following.followed_user_id = invitable.member_user_id
      ) end
  from group_sizes
  left join invitable on invitable.group_id = group_sizes.group_id
  order by group_sizes.created_at, group_sizes.group_id, invitable.member_user_id;
end;
$$;

revoke all on function public.list_event_group_invitees(uuid) from public;
revoke all on function public.list_event_group_invitees(uuid) from anon;
grant execute on function public.list_event_group_invitees(uuid) to authenticated;
grant execute on function public.list_event_group_invitees(uuid) to service_role;
```

2. 続けて `create_event_user_invitations`: 現行の定義（`supabase/migrations/037_event_invitation_rate_limit.sql` の `create or replace function public.create_event_user_invitations(` から、その関数の `$$;` まで。後の migration で上書きされていないことを確かめ、されていれば最新を写す）をそのまま写し、次の1か所だけ変える。写したあとに、037 にあるこの関数の revoke / grant 行も続けて写す。

```sql
  if cardinality(p_invitee_user_ids) not between 1 and 20 then
```
を
```sql
  -- グループ（最大30人）をまとめて招待できるよう、上限をグループの上限にそろえる。
  if cardinality(p_invitee_user_ids) not between 1 and 30 then
```

3. 最後に `commit;`

- [ ] **Step 4: 通ることを確認する**

push して CI の `db-tests` がすべて通ることを確かめる。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/056_event_group_invitees.sql tests/db/event-group-invitees.test.ts
git commit -m "feat(db): イベントに招待できるグループのメンバーを返す RPC を足し、招待の上限を30人にする（migration 056）"
```

---

### Task 2: 【止まって確認】056 を本番に適用し、型を再生成する

関数を1つ足し、招待の上限を30人に上げる。今の画面では20件ずつしか選べないので、動きは変わらない。

- [ ] **Step 1: ユーザーに承認を求め、実行してもらう**

```
! npx supabase db query --linked --project-ref esheopszeqggftmawdmu -f supabase/migrations/056_event_group_invitees.sql
```

- [ ] **Step 2: 適用を確かめる**

`list_event_group_invitees` が authenticated から実行でき anon からはできないこと、`pg_get_functiondef('public.create_event_user_invitations(uuid,uuid[])'::regprocedure)` に `between 1 and 30` が含まれることを読み取りのクエリで確かめる。

- [ ] **Step 3: 型を再生成してコミット**

Run: `npx supabase gen types typescript --project-id esheopszeqggftmawdmu --schema public > lib/supabase/database.types.ts`
Expected: `list_event_group_invitees` だけが増える。`npx tsc --noEmit` が通る。

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(supabase): migration 056 適用後の型を再生成する"
```

---

### Task 3: 型と組み立て、招待のグループボタン、ページの読み込み

**Files:**
- Modify: `lib/domain/account/connection-groups.ts`
- Modify: `components/event/event-invite-candidates.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Test: `tests/account/connection-groups.test.ts`、`tests/event/event-invite-candidates.test.tsx`、`tests/event/event-detail-data-loading.test.ts`

**Interfaces:**
- Consumes: Task 1 の RPC
- Produces:
  - `type EventInviteGroup = { id: string; name: string; color: ConnectionGroupColor; memberCount: number; invitees: ConnectionCandidate[] }`
  - `buildEventInviteGroups(rows: EventGroupInviteeRpcRow[]): EventInviteGroup[]`（行の並びを保ち、グループごとにまとめる。`user_id` が null の行は招待できる人なし）
  - `EventInviteCandidates` の props に `groups?: EventInviteGroup[]`（省略時は `[]`）を足す

- [ ] **Step 1: テストを書く（失敗するもの）**

`tests/account/connection-groups.test.ts` に足す（import に `buildEventInviteGroups` を足す）:

```ts
describe("buildEventInviteGroups", () => {
  it("グループごとにまとめ、招待できる人を候補の形にする。null の行は招待できる人なし", () => {
    expect(
      buildEventInviteGroups([
        { group_id: "g1", group_name: "謎解き仲間", group_color: "nazotoki", group_member_count: "2", user_id: "u1", display_name: "あや", shared_event_count: "3", is_following: true },
        { group_id: "g1", group_name: "謎解き仲間", group_color: "nazotoki", group_member_count: "2", user_id: "u2", display_name: "けん", shared_event_count: "0", is_following: true },
        { group_id: "g2", group_name: "大学の友達", group_color: "unknown", group_member_count: "1", user_id: null, display_name: null, shared_event_count: null, is_following: null }
      ])
    ).toEqual([
      {
        id: "g1",
        name: "謎解き仲間",
        color: "nazotoki",
        memberCount: 2,
        invitees: [
          { userId: "u1", displayName: "あや", sharedEventCount: 3, activeSharedEventCount: 0, latestSharedAt: "", isFollowing: true, isFollowedBy: false, isFavorite: false },
          { userId: "u2", displayName: "けん", sharedEventCount: 0, activeSharedEventCount: 0, latestSharedAt: "", isFollowing: true, isFollowedBy: false, isFavorite: false }
        ]
      },
      { id: "g2", name: "大学の友達", color: "nazotoki", memberCount: 1, invitees: [] }
    ]);
  });
});
```

`tests/event/event-invite-candidates.test.tsx` に足す（`within` を import に足す）:

```tsx
describe("グループでまとめて選ぶ", () => {
  const unloaded = { ...recent, userId: "55555555-5555-4555-8555-555555555555", displayName: "Eさん" };
  const groups = [
    { id: "g1", name: "謎解き仲間", color: "nazotoki" as const, memberCount: 2, invitees: [favorite, unloaded] },
    { id: "g2", name: "大学の友達", color: "boardgame" as const, memberCount: 3, invitees: [] }
  ];

  it("グループを作っていなければボタンの行を出さない", () => {
    render(<EventInviteCandidates candidates={[favorite]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "グループでまとめて選ぶ" })).not.toBeInTheDocument();
  });

  it("ボタンに招待できる人数を出し、0人のグループは押せない", () => {
    render(
      <EventInviteCandidates candidates={[favorite, recent]} nextCursor={null} action={vi.fn()} loadMoreAction={vi.fn()} groups={groups} />
    );
    const row = screen.getByRole("group", { name: "グループでまとめて選ぶ" });
    expect(within(row).getByRole("button", { name: /謎解き仲間 2人/ })).toBeEnabled();
    const full = within(row).getByRole("button", { name: /大学の友達/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent("全員参加済み・招待済み");
  });

  it("押すと、まだ読み込んでいない人も含めてチェックし、選んだ人を先頭に出す", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(
      <EventInviteCandidates candidates={[recent, favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} groups={groups} />
    );

    fireEvent.click(screen.getByRole("button", { name: /謎解き仲間 2人/ }));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAccessibleName("Aさんを招待する");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toHaveAccessibleName("Eさんを招待する");
    expect(checkboxes[1]).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bさんを招待する" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "2人に招待を送る" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith([favorite.userId, unloaded.userId]));
  });

  it("送ったあとは、その人たちをグループの招待できる人から外す", async () => {
    const action = vi.fn().mockResolvedValue({ status: "success" });
    render(
      <EventInviteCandidates candidates={[favorite]} nextCursor={null} action={action} loadMoreAction={vi.fn()} groups={groups} />
    );

    fireEvent.click(screen.getByRole("button", { name: /謎解き仲間 2人/ }));
    fireEvent.click(screen.getByRole("button", { name: "2人に招待を送る" }));

    await waitFor(() => expect(screen.getByText("招待を送りました")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /謎解き仲間/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Madoiで招待を送る" })).toBeInTheDocument();
  });
});
```

`tests/event/event-detail-data-loading.test.ts` に足す:

```ts
  it("招待候補とグループの招待できる人を並列に読む", () => {
    expect(source).toContain('supabase.rpc("list_event_group_invitees"');
    expect(source).toMatch(/Promise\.all\(\[\s*loadInviteCandidates\(eventId, supabase\),\s*loadEventInviteGroups\(eventId, supabase\)/);
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account/connection-groups.test.ts tests/event/event-invite-candidates.test.tsx tests/event/event-detail-data-loading.test.ts`
Expected: FAIL（`buildEventInviteGroups` がない、グループの行がない、並列の読み込みがない）

- [ ] **Step 3: 型と組み立てを足す**

`lib/domain/account/connection-groups.ts` の先頭に `import type { ConnectionCandidate } from "@/lib/domain/account/connections";` を足し、末尾に次を足す:

```ts
export type EventInviteGroup = {
  id: string;
  name: string;
  color: ConnectionGroupColor;
  /** グループの人数（ブロック関係・退会した人を除く）。 */
  memberCount: number;
  /** そのイベントにいま招待できるメンバー。 */
  invitees: ConnectionCandidate[];
};

type EventGroupInviteeRpcRow = {
  group_id: string;
  group_name: string;
  group_color: string;
  group_member_count: number | string;
  user_id: string | null;
  display_name: string | null;
  shared_event_count: number | string | null;
  is_following: boolean | null;
};

export function buildEventInviteGroups(rows: EventGroupInviteeRpcRow[]): EventInviteGroup[] {
  const groups: EventInviteGroup[] = [];
  const byId = new Map<string, EventInviteGroup>();

  for (const row of rows) {
    let group = byId.get(row.group_id);
    if (!group) {
      group = {
        id: row.group_id,
        name: row.group_name,
        color: isConnectionGroupColor(row.group_color) ? row.group_color : defaultConnectionGroupColor,
        memberCount: Number(row.group_member_count),
        invitees: []
      };
      byId.set(row.group_id, group);
      groups.push(group);
    }

    if (row.user_id) {
      group.invitees.push({
        userId: row.user_id,
        displayName: row.display_name ?? "Madoiユーザー",
        sharedEventCount: Number(row.shared_event_count ?? 0),
        activeSharedEventCount: 0,
        latestSharedAt: "",
        isFollowing: Boolean(row.is_following),
        isFollowedBy: false,
        isFavorite: false
      });
    }
  }

  return groups;
}
```

- [ ] **Step 4: 招待の部品にグループの行を足す**

`components/event/event-invite-candidates.tsx`:

1. import に `import { clsx } from "clsx";` と `import { connectionGroupDotClass, type EventInviteGroup } from "@/lib/domain/account/connection-groups";` を足す
2. props に `groups = []`（型 `groups?: EventInviteGroup[]`）を足し、state `const [inviteGroups, setInviteGroups] = useState(groups);` を持つ
3. 選んだ人を先頭に出す並びを作る（読み込み済みの候補にいない人は、グループの招待できる人から補う）:

```tsx
  const knownCandidates = new Map(orderedCandidates.map((candidate) => [candidate.userId, candidate]));
  for (const group of inviteGroups) {
    for (const invitee of group.invitees) {
      if (!knownCandidates.has(invitee.userId)) knownCandidates.set(invitee.userId, invitee);
    }
  }
  const selectedCandidates = selectedIds.flatMap((id) => {
    const candidate = knownCandidates.get(id);
    return candidate ? [candidate] : [];
  });
  const displayedCandidates = [
    ...selectedCandidates,
    ...orderedCandidates.filter((candidate) => !selectedIds.includes(candidate.userId))
  ];

  function selectGroup(group: EventInviteGroup) {
    setSelectedIds((current) => [...current, ...group.invitees.map((invitee) => invitee.userId).filter((id) => !current.includes(id))]);
  }
```

4. 送信が成功したら、送った人をグループの招待できる人から外す（`setSelectedIds([])` の直前に）:

```tsx
        const sentIds = new Set(selectedIds);
        setInviteGroups((current) =>
          current.map((group) => ({ ...group, invitees: group.invitees.filter((invitee) => !sentIds.has(invitee.userId)) }))
        );
```

5. 候補が0人のときの早期 return の条件を `orderedCandidates.length === 0 && inviteGroups.length === 0` にする
6. 説明文（`一緒に参加した人や、フォロー中の人から選べます。`）の直後に、グループの行を置く:

```tsx
      {inviteGroups.length > 0 ? (
        <div role="group" aria-label="グループでまとめて選ぶ" className="grid gap-2">
          <p className="text-sm font-bold text-ink">グループでまとめて選ぶ</p>
          <div className="flex flex-wrap gap-2">
            {inviteGroups.map((group) => {
              const isEmpty = group.invitees.length === 0;
              return (
                <button
                  key={group.id}
                  type="button"
                  disabled={isEmpty || isPending}
                  onClick={() => selectGroup(group)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true" className={clsx("h-2.5 w-2.5 rounded-full", connectionGroupDotClass[group.color])} />
                  <span>{group.name}</span>
                  <span className="font-normal text-muted">
                    {isEmpty ? "全員参加済み・招待済み" : `${group.invitees.length}人`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
```

7. 候補の一覧の `orderedCandidates.map(...)` を `displayedCandidates.map(...)` にする
8. 送るボタンの文言を `{selectedIds.length > 0 ? `${selectedIds.length}人に招待を送る` : "Madoiで招待を送る"}` にする

- [ ] **Step 5: ページで並列に読む**

`app/events/[eventId]/page.tsx`:

1. import に `buildEventInviteGroups` を足す
2. `loadInviteCandidates` の直後に足す:

```tsx
async function loadEventInviteGroups(eventId: string, supabase: SupabaseServerClient) {
  const { data, error } = await supabase.rpc("list_event_group_invitees", { p_event_id: eventId });

  if (error) {
    throw new Error("グループを読み込めませんでした。");
  }

  return buildEventInviteGroups(data ?? []);
}
```

3. `EventMembersInviteCandidates` の読み込みを次にし、`EventInviteCandidates` に `groups={groups}` を渡す:

```tsx
  const [page, groups] = await Promise.all([
    loadInviteCandidates(eventId, supabase),
    loadEventInviteGroups(eventId, supabase)
  ]);
```

- [ ] **Step 6: 通ることを確認する**

Run: `npx vitest run tests/account tests/event && npx tsc --noEmit && npx eslint components/event app/events lib/domain/account`
Expected: PASS、型・lint のエラーなし

- [ ] **Step 7: コミット**

```bash
git add lib/domain/account/connection-groups.ts components/event/event-invite-candidates.tsx "app/events/[eventId]/page.tsx" tests/account tests/event
git commit -m "feat(event): 招待でグループのボタンからまとめて選べるようにする"
```

---

### Task 4: 検証と PR

- [ ] **Step 1: 全テスト・型・lint・build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 2: アクセシビリティ**

`accessibility` を通す（グループのボタンの読み上げ名に名前と人数が入ること、押せないボタンの理由が読めること、選んだ人が先頭に来たあとのフォーカス）。

- [ ] **Step 3: レビューと PR**

Codex（Sol / high）の PR 前レビュー → 指摘の裏取りと対応 → PR を作る。056 は Task 2 で本番適用済みなので、マージ後の DB 作業はない。

- [ ] **Step 4: 本番の確認をユーザーに頼む（まとめての確認でよい）**

- どの画面: スマホで、自分が主催で、グループのメンバーがまだ参加していないイベントの詳細を開く
- 操作: 「Madoiで招待」の「グループでまとめて選ぶ」でグループを押す
- 見るもの: そのグループの人にチェックが入り、一覧の先頭に出る。送るボタンが「○人に招待を送る」になる。送ると「招待を送りました」が出て、そのグループのボタンが「全員参加済み・招待済み」になる
- NG: すでに参加している人・招待済みの人にチェックが入る／21人以上のグループで送れない
