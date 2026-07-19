# Legacy Security Helper Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新しいアプリが本番で安定して動作した後、不要になった公開スキーマの関係判定補助関数を安全に削除する。

**Architecture:** 初回リリースでは旧アプリへ戻せるよう補助関数を`authenticated`と`service_role`限定で残す。本番の新アプリに旧関数呼出しがないことを確認してから、別マイグレーションで削除し、匿名・認証済み双方の挙動を実測する。

**Tech Stack:** Supabase/PostgreSQL、Vitest 2、Node.js 22

## Global Constraints

- この計画は性能・セキュリティ基盤の新アプリがmainへ反映され、本番スモークテストが成功するまで開始しない。
- 旧関数削除前に`tests/legacy-helper-usage.test.ts`と本番スモークテストで旧関数への依存がないことを確認する。
- 既存データを削除しない。問題時は前進マイグレーションで限定互換関数を再作成する。

---

### Task 1: 旧公開補助関数を削除する

**Files:**
- Create: `supabase/migrations/025_drop_legacy_security_helpers.sql`
- Modify: `tests/supabase/function-privileges.test.ts`
- Modify: `scripts/security/verify-function-privileges.mjs`
- Modify: `tests/security-script.test.ts`

**Interfaces:**
- Removes: `public.is_event_owner(uuid)`
- Removes: `public.is_joined_event_member(uuid)`
- Removes: `public.have_shared_event(uuid, uuid)`
- Removes: `public.is_user_blocked(uuid, uuid)`
- Removes: `public.is_event_member(uuid)`
- Removes: `public.is_following(uuid, uuid)`
- Preserves: `private.*`のRLS補助関数と用途別公開RPC。

- [ ] **Step 1: 削除契約の失敗テストを書く**

`tests/supabase/function-privileges.test.ts`へ、025が上記6関数だけを削除し、`block_user_atomic`、`list_owned_event_ids`、022〜024の用途別RPCを削除しないことを追加する。権限実測スクリプトには`EXPECT_LEGACY_HELPERS_MISSING=true`を追加し、この時だけ旧6関数の404を成功、新用途別RPCのanon 401/403を成功と判定する。

- [ ] **Step 2: 025未作成で失敗することを確認する**

Run: `npm.cmd exec vitest -- run tests/supabase/function-privileges.test.ts --no-cache`

Expected: 025が存在しないためFAIL。

- [ ] **Step 3: 削除マイグレーションを実装する**

```sql
begin;
drop function if exists public.is_event_owner(uuid);
drop function if exists public.is_joined_event_member(uuid);
drop function if exists public.have_shared_event(uuid, uuid);
drop function if exists public.is_user_blocked(uuid, uuid);
drop function if exists public.is_event_member(uuid);
drop function if exists public.is_following(uuid, uuid);
commit;
```

- [ ] **Step 4: 静的テストを通す**

Run: `npm.cmd exec vitest -- run tests/supabase/function-privileges.test.ts tests/legacy-helper-usage.test.ts tests/security-script.test.ts --no-cache`

Expected: 全件PASS。

- [ ] **Step 5: コミットする**

```powershell
git add -- supabase/migrations/025_drop_legacy_security_helpers.sql tests/supabase/function-privileges.test.ts scripts/security/verify-function-privileges.mjs tests/security-script.test.ts
git commit -m "security: remove legacy public helper functions"
```

---

### Task 2: 検証DBと本番DBで削除を確認する

**Files:**
- Verify: `supabase/migrations/025_drop_legacy_security_helpers.sql`
- Verify: `scripts/security/verify-function-privileges.mjs`

**Interfaces:**
- Consumes: Task 1の025。
- Produces: 旧関数404、保護RPCのanon 401/403、新用途別RPCのauthenticated成功という実測結果。

- [ ] **Step 1: 検証DBへ025を適用する**

Run: `psql $env:SECURITY_TEST_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/migrations/025_drop_legacy_security_helpers.sql`

Expected: `COMMIT`、終了コード0。

- [ ] **Step 2: 匿名越権がないことを確認する**

Run:

```powershell
$env:EXPECT_LEGACY_HELPERS_MISSING="true"
npm.cmd run security:verify-db
```

Expected: 旧関数は404、保護RPCのanonは401または403、用途別RPCのauthenticatedは成功、終了コード0。

- [ ] **Step 3: 検証環境の回帰テストを行う**

Run:

```powershell
npm.cmd exec vitest -- run --no-cache
npm.cmd run build
```

Expected: テストと本番ビルドが終了コード0。続けて検証URLで、つながりの分類変更、カレンダー月移動、イベント詳細、招待、チャット投稿を各1回実行し、5xxが発生しない。

- [ ] **Step 4: 本番DBへ025を適用する**

Run: `psql $env:PRODUCTION_DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/migrations/025_drop_legacy_security_helpers.sql`

Expected: `COMMIT`、終了コード0。接続先ホストを実行前に読み上げ、検証DBでないことを確認する。

- [ ] **Step 5: 本番を再確認する**

Run:

```powershell
$env:ALLOW_PRODUCTION_SECURITY_PROBE="true"
$env:EXPECT_LEGACY_HELPERS_MISSING="true"
npm.cmd run security:verify-db
```

Expected: 旧関数404、保護RPCのanon 401または403、終了コード0。続けて本番URLでStep 3と同じ5操作を各1回確認する。

本番で異常が出た場合は、削除した6関数を021と同じ定義・権限で再作成する`026_restore_limited_legacy_helpers.sql`を前進適用する。DB履歴を戻したり既存マイグレーションを書き換えたりしない。
