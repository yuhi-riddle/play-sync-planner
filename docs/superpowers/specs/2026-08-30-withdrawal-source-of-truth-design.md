# 退会状態の正本を改ざん不能な場所へ移す（High 1）

## 背景

2026-08-30 の再レビュー（`docs/review/2026-08-30-fix-plan.md` High 1）で次の指摘が出た。

- 退会判定に使う印を `auth.users.user_metadata.withdrawn_at` に保存している
  （`lib/actions/account/account.ts:86-92`）。
- `middleware.ts:137` がその `user_metadata` を信頼して退会ゲートを判定している
  （`isWithdrawnUserMetadata(user.user_metadata)`、実体は `lib/domain/account/account.ts:29-36`）。
- `user_metadata` は本人が Supabase Auth の `updateUser()` で書き換えられる。
  退会後に Google で再認証してセッションを取り、`withdrawn_at` を消せば退会ゲートを回避できる。
- 同じ `middleware.ts:163-164` には「`user_metadata` は本人が書き換えられるので同意印には使えない、
  だから `app_metadata` で見る」というコメントがある。退会ゲートだけこの原則から外れている。
- `account.ts` は `profiles.deleted_at` も立てている（migration 023 で列は存在）が、middleware は参照していない。
- `/api/*` は `middleware.ts:79` の `isPublicRequest` で middleware を素通りする。
  退会ゲートが効くのは画面遷移だけで、API ルートには効いていない。

## 目的

- 退会状態の判定を、本人が書き換えられない場所（`app_metadata` と DB）だけに依存させる。
- 既存の「規約同意」と同じ構造にそろえ、判定ヘルパー・テストの作りを流用する。
- middleware だけでなく、Server Action と API ルートでも退会済みを弾く。

## 既存の「規約同意」パターン（踏襲する形）

| 役割 | 同意 | 退会（本設計で作る） |
|---|---|---|
| 正本（法的・監査用の記録） | `public.user_consents` テーブル | `public.profiles.deleted_at` |
| 高速判定用の印 | `app_metadata.legal_consent_accepted_at` | `app_metadata.withdrawn_at` |
| 印を書く | `lib/auth/legal-consent-mark.ts` `markLegalConsentAccepted()` | `lib/auth/withdrawal-mark.ts` `markAccountWithdrawn()` |
| 印を読む | `lib/domain/account/legal-consent.ts` `hasLegalConsentMark()` | `lib/domain/account/withdrawal.ts` `isWithdrawn()` |
| 既存ユーザーのバックフィル | migration 026 | migration 040 |

`app_metadata` は service role でしか書けない。`getCurrentUser()` が返す user オブジェクトに
`app_metadata` が含まれるので、印による判定は追加クエリなしでできる（`hasLegalConsentMark` と同じ）。

## スコープ

**対象**

- `lib/domain/account/withdrawal.ts`（新規）— `isWithdrawn()` と定数
- `lib/auth/withdrawal-mark.ts`（新規）— `markAccountWithdrawn()`
- `lib/domain/account/account.ts` — `isWithdrawnUserMetadata()` を削除（`withdrawal.ts` に移設）
- `lib/supabase/server.ts` — 退会済みを弾く取得ヘルパーを追加
- `middleware.ts:137` — 退会ゲートの判定を差し替え
- `lib/actions/account/account.ts` — 印の書き込みを `markAccountWithdrawn()` に変更、`user_metadata.withdrawn_at` をやめる
- データ変更を伴う Server Action（`lib/actions/**`）— 退会済みを弾く取得ヘルパーに差し替え
- API ルート（`app/api/google-calendar/*`、`app/api/events/[eventId]/availability/route.ts`）— 退会チェックを追加
- `supabase/migrations/040_withdrawal_app_metadata.sql`（新規）— バックフィル
- テスト（`tests/middleware/middleware-withdrawn.test.ts`、`tests/account/**`、新規の改ざんテスト）

**対象外**

- 退会処理の非トランザクション更新の是正・`profiles.deletion_state` の追加 → High 2 で扱う。
  本設計は「正本の置き場所を変える」だけ。`account.ts` の物理削除群は High 2 まで現状のまま残る。
- 全テーブルへの RLS による退会ブロック → 本設計では入れない（「フォローアップ」参照）。
- `user_metadata.nickname` の匿名化（`account.ts:89`）→ 表示用途なので残す。`withdrawn_at` だけやめる。

## 設計

### 1. 判定ヘルパー（`lib/domain/account/withdrawal.ts`）

`lib/domain/account/legal-consent.ts` と同じ形。

```ts
export const WITHDRAWAL_METADATA_KEY = "withdrawn_at";

/**
 * 退会済みの印が app_metadata にあるか。
 * app_metadata は service role でしか書けないので、本人が印を偽装できない。
 */
export function isWithdrawn(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }
  const withdrawnAt = (appMetadata as Record<string, unknown>)[WITHDRAWAL_METADATA_KEY];
  return typeof withdrawnAt === "string" && withdrawnAt.length > 0;
}
```

`lib/domain/account/account.ts:29-36` の `isWithdrawnUserMetadata` は削除。呼び出し元は middleware だけ。

### 2. 印を書く（`lib/auth/withdrawal-mark.ts`）

`lib/auth/legal-consent-mark.ts` と同じ形。

```ts
import { WITHDRAWAL_METADATA_KEY } from "@/lib/domain/account/withdrawal";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 退会済みの印を app_metadata に書く。
 * 正本は profiles.deleted_at。これは middleware / Server Action を1往復で済ませるための印。
 */
export async function markAccountWithdrawn(userId: string, withdrawnAt: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [WITHDRAWAL_METADATA_KEY]: withdrawnAt }
  });
  if (error) {
    throw new Error(error.message);
  }
}
```

### 3. 取得ヘルパー（`lib/supabase/server.ts`）

退会済みを「未認証と同じ」に落とす。既存の各アクションは `if (!userId) redirect("/login")` /
`if (!user) return errorState(...)` のような分岐をすでに持っているので、`null` を返せばそのまま流用できる。

```ts
import { isWithdrawn } from "@/lib/domain/account/withdrawal";

export const getCurrentActiveUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  if (isWithdrawn(user.app_metadata)) return null;
  return user;
});

export const getCurrentActiveUserId = cache(async () => {
  const user = await getCurrentActiveUser();
  return user?.id ?? null;
});
```

- 既存の `getCurrentUser` / `getCurrentUserId` は**変えない**。`app/layout.tsx` やページの表示制御など、
  退会と無関係な箇所まで挙動が変わるのを避ける。
- 差し替えるのは「データを変更する Server Action」に限定する（下記）。
- 判定は `app_metadata` の印だけを見る。`profiles.deleted_at` へのフォールバック追加クエリは入れない。
  バックフィル（設計項目 6）がデプロイ時に走るので、印の無い退会済みユーザーは残らない。
  退会アクション自身も印と `deleted_at` の両方を書くので、以後も同期する。

### 4. middleware（`middleware.ts:137`）

```ts
// before
if (user && isWithdrawnUserMetadata(user.user_metadata) && request.nextUrl.pathname !== "/login") {
// after
if (user && isWithdrawn(user.app_metadata) && request.nextUrl.pathname !== "/login") {
```

import を `@/lib/domain/account/account` から `@/lib/domain/account/withdrawal` に変更。
その先の `signOut()` → `/login?withdrawn=1` リダイレクトはそのまま。

### 5. 退会アクション（`lib/actions/account/account.ts`）

- 冒頭の `getCurrentUser()` は退会前提の処理なので変えない（すでに退会済みなら二重実行だが害はない。
  厳密にやるなら `isWithdrawn` で早期 return してもよい — 実装時に判断）。
- `:86-92` の `updateUserById({ user_metadata: { ...nickname, withdrawn_at } })` を次のように分割:
  - `user_metadata` は `nickname` の匿名化だけ残す。
  - `withdrawn_at` は `user_metadata` から外し、`await markAccountWithdrawn(user.id, withdrawnAt)` を呼ぶ。
- `:76-79` の `profiles.deleted_at` 書き込みはそのまま（正本）。
- 物理削除群（`:56-68` ほか）とエラー未確認の問題は High 2 で対応。本設計では触らない。

### 6. Server Action の差し替え範囲

`getCurrentUserId` / `getCurrentUser` を `getCurrentActiveUserId` / `getCurrentActiveUser` に差し替える。
**データを変更するもの**が対象。読み取り専用のページ（`app/**/page.tsx`）は middleware 頼りで据え置き。

対象ファイル（`lib/actions/` 配下、実装時に各ファイルの export を確認して確定する）:

- `account/connections.ts` — フォロー・お気に入り・ブロック
- `account/profile.ts` — プロフィール更新
- `account/legal.ts` — 同意記録（退会済みが同意を打ち直す意味はない）
- `calendar/calendar.ts` — カレンダー連携・イベント作成
- `event/events.ts`、`event/event-members.ts`、`event/event-messages.ts`、`event/event-tasks.ts`
- `plan/plans.ts`、`plan/answers.ts`、`plan/confirm.ts`、`plan/participants.ts`、`plan/plan-timetable.ts`、`plan/share-links.ts`
- `settlement/settlements.ts`、`settlement/reminders.ts`
- `shared/notifications.ts`

`account/account.ts`（退会本体）と `account/auth.ts`（サインアウト等）は対象外。

### 7. API ルート

middleware を通らない `/api/*` のうち、認証ユーザーとして副作用を持つもの:

- `app/api/google-calendar/connect/route.ts`
- `app/api/google-calendar/callback/route.ts`
- `app/api/google-calendar/disconnect/route.ts`
- `app/api/google-calendar/freebusy/route.ts`
- `app/api/events/[eventId]/availability/route.ts`

いずれも冒頭で `getCurrentUser()`（または `getCurrentUserId()`）を呼んでいる。
`getCurrentActiveUser()` に差し替え、`null` なら 401（既存の未認証時と同じ応答）を返す。

`app/api/cron/*` は CRON_SECRET 認証で個人セッションを使わないため対象外。

### 8. バックフィル・マイグレーション（`supabase/migrations/040_withdrawal_app_metadata.sql`）

migration 026 と同じ書き方。`profiles.deleted_at` が入っている行の `app_metadata` に印を移す。

```sql
-- 既存の退会済みユーザーの印を app_metadata に移す。
-- 正本は public.profiles.deleted_at のまま。このマイグレーションは profiles を変更しない。
-- 既に印がある行には触れないので、何度実行しても結果は同じ。
update auth.users as u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'withdrawn_at',
       to_char(date_trunc('milliseconds', p.deleted_at at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     )
from public.profiles as p
where u.id = p.user_id
  and p.deleted_at is not null
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'withdrawn_at');
```

**個別承認が必要**（スキーマ／`auth.users` への書き込み）。CLAUDE.md の安全ルールに従い、この SQL で承認を取ってから実装。

※ `user_metadata.withdrawn_at` の掃除は必須ではない（判定に使わなくなるので無害）。
気になるなら別 update で消せるが、本設計では残置とする（実害なし・ロールバックが楽）。

## テスト（TDD、RED を先に確認）

- `tests/middleware/middleware-withdrawn.test.ts` を改修:
  - `app_metadata.withdrawn_at` があれば `/login?withdrawn=1` へ（現行は `user_metadata` 前提なので RED になる）。
  - **改ざんテスト**: `user_metadata` が空 or `withdrawn_at` を消してあっても、`app_metadata` に印があれば弾く。
  - `app_metadata` に印が無ければ素通り（`user_metadata` に `withdrawn_at` があっても無視）。
- `tests/account/**`:
  - 退会アクションが `markAccountWithdrawn`（= `updateUserById({ app_metadata })`）を呼ぶ。
  - 退会アクションが `user_metadata.withdrawn_at` を**書かない**。
  - `profiles.deleted_at` は従来どおり書く。
- Server Action の差し替え確認（代表を数本）: 退会済みの `app_metadata` を持つ user で
  `getCurrentActiveUserId()` が `null` を返し、アクションが `/login` へ redirect / errorState になる。
- API ルート（代表1本、例: `freebusy`）: 退会済みで 401。
- マイグレーション 040: 実 PostgreSQL で、`deleted_at` のある行に印が付き、既存の印は上書きしないこと
  （High 3 で CI に入る一時 Postgres を使う。無ければこのタスクで最小の適用テストを足す）。

## 実施手順（Codex へ委譲）

1. `withdrawal.ts` / `withdrawal-mark.ts` を追加、`isWithdrawnUserMetadata` を移設。テスト（ドメイン単体）。
2. middleware の判定差し替え + `tests/middleware/middleware-withdrawn.test.ts` 改修（RED → GREEN）。
3. `getCurrentActiveUser*` を追加。退会アクションの印書き込みを差し替え。account テスト改修。
4. Server Action 差し替え（ファイル単位でコミット）。
5. API ルート差し替え。
6. マイグレーション 040 の SQL を提示 → **個別承認** → 追加。適用テスト。
7. `docs/review/2026-08-30-fix-plan.md` は変更不要（この設計へのリンクを1行足す程度）。

各ステップ後に `npm test` / `npm run lint` / `npm run typecheck` を実際に流す。
差分は Claude Code がレビューしてから次へ進む。PR は項目（またはステップ）ごとに小さく分ける。

## フォローアップ（本設計では扱わない）

- **RLS による退会ブロック**: `auth.jwt() -> 'app_metadata' ->> 'withdrawn_at'` はポリシー内で参照できる。
  多層防御として、保持データ（`plans` / `settlements` / `participants` / `events` など）の
  SELECT ポリシーに退会チェックを足す案がある。範囲が広く回帰リスクもあるので、
  High 1/2 が落ち着いてから別タスクで検討する。
- **退会処理のトランザクション化・再実行可能化**（`profiles.deletion_state`）→ High 2。
