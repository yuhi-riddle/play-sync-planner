# つながりのグループ PR④ 実装計画（お気に入りの削除）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グループに置き換えたお気に入りを、DB（表・関数・RPC の列と分岐）と画面側の型・関数から取り除く。

**Architecture:** migration 057 で、お気に入りを参照する関数を作り直してから `user_favorites` を消す。戻り値の列が変わる `list_connections` と `list_event_invite_candidates` は drop してから作り直す。画面側は型から `isFavorite` と `"favorites"` を外し、使われていない `sortInviteCandidates` と `toggleFavoriteAction` を消す。

**Tech Stack:** Supabase（Postgres 16、RPC）/ Next.js 15 / Vitest（jsdom・DB）

**設計:** `docs/superpowers/specs/2026-09-25-connection-groups-design.md`（「お気に入りの移行」）

## Global Constraints

- 前提: 本番の `user_favorites` は0件（2026-09-26 に確認。migration 054 の移行でも0件）。移すデータはない
- 関数の引数は変えない。戻り値から消すのは `is_favorite` 列だけ。ほかの列・並び・条件・権限は元のまま
- 057 を本番に先に適用しても、デプロイ前のアプリが壊れないこと（旧アプリは `is_favorite` を読むが、無くても `undefined` になるだけで画面には使っていない。お気に入りの切り替えは画面から呼ばれていない）
- 過去の migration（017〜056）は書き換えない。過去の migration の中身を確かめる静的テスト（`tests/account/schema/*`・`tests/event/schema/*`）は、そのファイルの記録として残す
- 本番 DB への適用は、承認を得てから `npx supabase db query --linked --project-ref esheopszeqggftmawdmu -f supabase/migrations/057_drop_favorites.sql` で行う（`.claude/settings.local.json` で許可済み）

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `supabase/migrations/057_drop_favorites.sql`（新規） | お気に入りを参照する関数の作り直しと、表・関数の削除 |
| `tests/db/drop-favorites.test.ts`（新規） | 削除後の DB の動きのテスト |
| `tests/db/connection-groups-favorites-migration.test.ts`（削除） | 移行関数ごとなくなる |
| `tests/db/connection-groups.test.ts`（変更） | お気に入りを入れていたテストを外す |
| `tests/db/finalize-account-withdrawal.test.ts`（変更） | お気に入りの行の準備と確認を外す |
| `lib/domain/account/connections.ts`（変更） | `isFavorite`・`"favorites"`・`sortInviteCandidates` を外す |
| `lib/actions/account/connections.ts`（変更） | `toggleFavoriteAction` と関係する定数を外す |
| `lib/domain/account/connection-groups.ts`、`components/account/connection-list.tsx`（変更） | `isFavorite` と `"favorites"` の参照を外す |
| `tests/account/*`、`tests/event/event-invite-candidates.test.tsx`（変更） | お気に入りのテスト・データを外す |
| `lib/supabase/database.types.ts`（再生成） | 057 を本番に適用したあとに再生成 |

---

### Task 1: migration 057 と DB テスト

**Files:**
- Create: `supabase/migrations/057_drop_favorites.sql`
- Create: `tests/db/drop-favorites.test.ts`
- Delete: `tests/db/connection-groups-favorites-migration.test.ts`
- Modify: `tests/db/connection-groups.test.ts`、`tests/db/finalize-account-withdrawal.test.ts`

- [ ] **Step 1: DB テストを書く（失敗するもの）**

`tests/db/drop-favorites.test.ts`（先頭のヘルパーは `tests/db/connection-groups.test.ts:1-78` の `client`・`makeUser`・`makeEvent`・`joinEvent`・`shareEvent`・`asUser`・`beforeAll`〜`afterEach` を写す。`createGroup`・`expectErrorCode` は使わない）:

```ts
async function columnsOf(sql: string, params: unknown[] = []) {
  const { fields } = await client.query(sql, params);
  return fields.map((field) => field.name);
}

describe("お気に入りの削除", () => {
  it("user_favorites・toggle_favorite_atomic・移行関数がない", async () => {
    const { rows } = await client.query(
      "select to_regclass('public.user_favorites') as tbl, to_regprocedure('public.toggle_favorite_atomic(uuid)') as toggle, to_regprocedure('private.migrate_favorites_to_connection_groups()') as migrate"
    );
    expect(rows[0]).toEqual({ tbl: null, toggle: null, migrate: null });
  });

  it("list_connections と list_event_invite_candidates の戻り値に is_favorite がない", async () => {
    const me = await makeUser();
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    expect(await columnsOf("select * from public.list_connections('following', null, null, 20)")).not.toContain("is_favorite");
    expect(
      await columnsOf("select * from public.list_event_invite_candidates($1, null, null, null, 20)", [target])
    ).not.toContain("is_favorite");
  });

  it("つながり・件数・招待候補・招待はフォローと一緒に参加だけで今までどおり動く", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const followedOnly = await makeUser();
    await shareEvent(me, aya);
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2),($1,$3)", [
      me,
      aya,
      followedOnly
    ]);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    const following = await client.query("select user_id from public.list_connections('following', null, null, 20)");
    expect(following.rows.map((row) => row.user_id)).toEqual([aya]);
    const counts = await client.query("select category, item_count from public.get_connection_counts()");
    const byCategory = Object.fromEntries(counts.rows.map((row) => [row.category, Number(row.item_count)]));
    expect(byCategory.following).toBe(1);
    expect(byCategory).not.toHaveProperty("favorites");

    const candidates = await client.query(
      "select user_id from public.list_event_invite_candidates($1, null, null, null, 20)",
      [target]
    );
    expect(candidates.rows.map((row) => row.user_id).sort()).toEqual([aya, followedOnly].sort());

    const invited = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      [followedOnly]
    ]);
    expect(invited.rows[0].result).toMatchObject({ ok: true, created_count: 1 });
  });

  it("ブロックと退会は今までどおり動く", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await client.query("select public.block_user_atomic($1)", [aya]);
    const { rows } = await client.query(
      "select count(*)::int as n from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2",
      [me, aya]
    );
    expect(rows[0].n).toBe(1);

    await client.query("select public.finalize_account_withdrawal($1)", [aya]);
  });
});
```

既存テストの変更:
- `tests/db/connection-groups-favorites-migration.test.ts` を削除する
- `tests/db/connection-groups.test.ts` の `describe("list_connections / get_connection_counts からお気に入りの振り分けを外す", ...)` を丸ごと削除する（同じことを `drop-favorites.test.ts` の3件目が確かめる）
- `tests/db/finalize-account-withdrawal.test.ts:37` 付近の `user_favorites` への insert と、`:88` 付近の `user_favorites` の件数の確認を削除する

- [ ] **Step 2: 失敗を確認する**

ブランチを push し、CI の `db-tests` で `drop-favorites.test.ts` が落ちること（表と関数がまだある、`is_favorite` 列がある）を確かめる。`finalize-account-withdrawal.test.ts` と `connection-groups.test.ts` は変更後も通ること。

- [ ] **Step 3: migration を書く**

`supabase/migrations/057_drop_favorites.sql` を `begin;` で始め、次の順に並べて `commit;` で終える。各関数は現行の定義を写し、書いてある箇所だけを変える。写した関数の revoke / grant も続けて写す。

1. `create_event_user_invitations`: `supabase/migrations/056_event_group_invitees.sql` の定義を写し、招待できる条件の `or exists (select 1 from public.user_favorites ... )` の塊（`user_favorites` を読む3〜5行）を消す。`have_shared_event` と `user_connections` の条件は残す
2. `block_user_atomic`: `supabase/migrations/053_connection_groups.sql` の定義を写し、`delete from public.user_favorites where ... ;`（3行）を消す
3. `finalize_account_withdrawal`: `053_connection_groups.sql` の定義を写し、`delete from public.user_favorites ...` の2行を消す
4. `get_connection_counts`: `supabase/migrations/054_migrate_favorites_to_connection_groups.sql` の定義を写し、次を消す: `favorite.user_id is not null as is_favorite` の列（直前の行末のカンマも整える）、`left join public.user_favorites as favorite ...` の3行、`relation_state.is_favorite` / `false as is_favorite` を運ぶ列、件数の一覧の `('favorites'::text, 1)` の行（あとの並び番号は詰めなくてよい）。戻り値の形は変わらないので `create or replace` のまま
5. `list_connections`: 戻り値から `is_favorite` を消すため、先に `drop function if exists public.list_connections(text, timestamptz, uuid, integer);` を書き、`054` の定義を `create function` で写したうえで、`returns table` の `is_favorite boolean,`、`p_category not in (...)` の `'favorites', `、上と同じ `is_favorite` の列・`user_favorites` の join・`is_favorite` を運ぶ列（`classified_connections`・`enriched_connections`・最後の select）を消す。revoke / grant を付け直す
6. `list_event_invite_candidates`: 同じく `drop function if exists public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer);` のあと、`supabase/migrations/034_connection_calendar_rpc.sql` の定義を `create function` で写し、`returns table` の `is_favorite boolean,`、候補の union の `select favorite.favorite_user_id from public.user_favorites ...`（`union` ごと）、`favorite.user_id is not null as is_favorite` と `favorite.created_at as favorite_created_at` の列、`user_favorites` の join、`cursor_at` の `coalesce` の `relation_state.favorite_created_at`（直前のカンマも整える）、`is_favorite` を運ぶ列を消す。revoke / grant を付け直す
7. `drop function if exists public.toggle_favorite_atomic(uuid);`
8. `drop function if exists private.migrate_favorites_to_connection_groups();`
9. `drop table if exists public.user_favorites;`（RLS のポリシーと索引も一緒に消える）

`supabase/migrations/*` の中で、上の関数のほかに現行の定義が `user_favorites` を読んでいるものがないか確かめ、あれば同じように作り直す。

- [ ] **Step 4: 通ることを確認する**

push して CI の `db-tests` がすべて通ることを確かめる。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/057_drop_favorites.sql tests/db
git commit -m "feat(db): お気に入りの表と関数をなくし、RPC から is_favorite を外す（migration 057）"
```

---

### Task 2: 【止まって確認】057 を本番に適用し、型を再生成する

- [ ] **Step 1: 承認を得てから適用する**

本番の `user_favorites` が0件のままであることを読み取りのクエリで確かめてから、承認を求め、`npx supabase db query --linked --project-ref esheopszeqggftmawdmu -f supabase/migrations/057_drop_favorites.sql` で適用する。

- [ ] **Step 2: 適用を確かめる**

`to_regclass('public.user_favorites')` と `to_regprocedure('public.toggle_favorite_atomic(uuid)')` が null、`list_connections` と `list_event_invite_candidates` が authenticated から実行でき anon からはできないことを確かめる。

- [ ] **Step 3: 型を再生成してコミット**

`npx supabase gen types typescript --project-id esheopszeqggftmawdmu --schema public > lib/supabase/database.types.ts`。`user_favorites`・`toggle_favorite_atomic`・`is_favorite` が型から消えることを `git diff` で確かめる。この時点では画面側の型エラーが出る（Task 3 で直す）ので、コミットは Task 3 と一緒にしてよい。

---

### Task 3: 画面側からお気に入りを外す

**Files:**
- Modify: `lib/domain/account/connections.ts`、`lib/actions/account/connections.ts`、`lib/domain/account/connection-groups.ts`、`components/account/connection-list.tsx`
- Test: `tests/account/connections.test.ts`、`tests/account/actions/connections.test.ts`、`tests/account/connection-list.test.tsx`、`tests/account/connection-groups.test.ts`、`tests/account/connections-page-performance.test.ts`、`tests/event/event-invite-candidates.test.tsx`

- [ ] **Step 1: テストを書き換える（失敗するもの）**

- `tests/account/connections.test.ts`: `describe("sortInviteCandidates", ...)` を削除する。`mapConnectionCandidateRow` / `mapConnectionPage` のテストの行データから `is_favorite` を、期待値から `isFavorite` を消す。`mapConnectionCounts` の期待値から `favorites` を消す。次を足す:

```ts
  it("ConnectionCandidate に isFavorite を持たない", () => {
    const candidate = mapConnectionCandidateRow({
      user_id: "u1",
      display_name: "あや",
      shared_event_count: 1,
      latest_shared_at: null,
      is_following: true,
      is_followed_by: false,
      cursor_at: "2026-09-28T00:00:00Z",
      cursor_user_id: "u1"
    });
    expect(candidate).not.toHaveProperty("isFavorite");
  });
```

- `tests/account/actions/connections.test.ts`: `toggleFavoriteAction` の import と、そのテスト（`describe` ごと）を削除する
- `tests/account/connection-list.test.tsx`・`tests/account/connection-groups.test.ts`・`tests/event/event-invite-candidates.test.tsx`: テストデータの `isFavorite: ...` を消す（変数名の `favorite` はそのままでよい）
- `tests/account/connections-page-performance.test.ts` の `not.toContain('from("user_favorites")')` はそのまま残す

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/account tests/event`
Expected: 新しいテスト「ConnectionCandidate に isFavorite を持たない」が FAIL

- [ ] **Step 3: 実装する**

- `lib/domain/account/connections.ts`: `ConnectionCandidate` から `isFavorite` を、`ConnectionCategory` から `"favorites"` を、`ConnectionRpcRow` から `is_favorite` を、`mapConnectionCandidateRow` から `isFavorite: row.is_favorite` を、件数の初期値から `favorites: 0` を消す。`sortInviteCandidates` と、それだけが使っていた補助関数を消す
- `lib/actions/account/connections.ts`: `toggleFavoriteAction` と `followRequiredErrorCode`（ほかで使っていなければ）を消す
- `lib/domain/account/connection-groups.ts`: `buildEventInviteGroups` の `isFavorite: false` を消す
- `components/account/connection-list.tsx`: `type ConnectionTabId = Exclude<ConnectionCategory, "favorites">;` を `type ConnectionTabId = ConnectionCategory;` にする

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: すべて成功

- [ ] **Step 5: コミット**

```bash
git add lib app components tests lib/supabase/database.types.ts
git commit -m "refactor(connections): お気に入りを型・Action・使われていない並べ替えから外す"
```

---

### Task 4: 検証と PR

- [ ] **Step 1:** Codex（Sol / high）の PR 前レビュー → 指摘の裏取りと対応 → PR を作る。057 は Task 2 で本番適用済みなので、マージ後の DB 作業はない
- [ ] **Step 2:** 設計doc の「お気に入りの移行」に、PR④で削除済みであることを追記する
- [ ] **Step 3:** 本番の確認をユーザーに頼む（まとめての確認でよい）: `/connections` の人のタブ・「グループに入れる」・招待候補・招待の送信・ブロックが今までどおり動く
