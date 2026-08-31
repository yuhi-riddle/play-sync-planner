# 複数テーブル更新のトランザクション化（High 2）

## 背景

`docs/review/2026-08-30-fix-plan.md` High 2。予定・費用・精算・支払い・退会の書き込みが、
複数の独立した DB 操作に分かれている。途中で失敗しても前の操作は確定し、一部は結果すら見ていない。

確認済みの箇所（最新コード）:

| 箇所 | 問題 |
|---|---|
| `lib/actions/plan/plans.ts:74` 作成 | plan insert → `participants` / `candidate_dates` / `share_links` / `plan_reminder_settings` を `Promise.all` で挿入。1つ失敗すると plan 行と一部の子だけ残る。 |
| `lib/actions/plan/plans.ts:147` 編集 | `availability_answers` 削除 → `candidate_dates` 削除 → 新 `candidate_dates` insert。insert 失敗時、旧候補日と回答が消えた状態。 |
| `lib/actions/settlement/settlements.ts:226` 再計算 | unpaid な `settlements` を delete → 再 insert → `plans.settlement_status` update。 |
| `settlements.ts:336` 費用作成 | `expenses` insert → `expense_splits` insert → `recomputeSettlements`。 |
| `settlements.ts:409` 費用編集 | `expenses` update → `expense_splits` 全 delete → 再 insert → `recomputeSettlements`。 |
| `settlements.ts:509` 費用削除 | `expenses` delete → `recomputeSettlements`。 |
| `settlements.ts:530` 支払い登録 | `settlement_payments` insert → `settlements` status update → `plans` update → 通知・監査。後半のエラーを見ていない。同時実行で精算行が競合。 |
| `lib/actions/account/account.ts:55` 退会 | 11 個の `delete`、`profiles` / `event_members` の `update`、storage 削除、`updateUserById` の結果を一切確認していない。 |

## grill-me 確定事項

- 非トランザクションな一連の更新は、すべて PL/pgSQL 関数（RPC）へ移し、関数内の暗黙トランザクションで実行する。
- 対象行を `SELECT ... FOR UPDATE` でロックして同時更新を直列化する。
- 退会は外部（Auth API・storage）を含むので単一トランザクションにできない
  → `profiles.deletion_state`（`pending` / `done`）で再実行可能にする。
- RPC の分割粒度はこの設計docで決める。
- 実装は Codex 委譲。RPC ごとに PR を分ける。

## 既存の RPC パターン（踏襲）

`supabase/migrations/030` の `mark_plan_settling`、`034` の各 list 関数:

```sql
create or replace function public.<name>(...)
returns <type>
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_plan_participant(target_plan_id) then      -- or is_plan_owner 相当
    raise exception '...';
  end if;
  ...
end;
$$;

revoke all on function public.<name>(...) from public;
revoke all on function public.<name>(...) from anon;
grant execute on function public.<name>(...) to authenticated;
grant execute on function public.<name>(...) to service_role;
```

呼び出し側は `supabase.rpc("<name>", { ... })` で 1 往復。エラーは `error` で受けて `failWith` に流す。

## 重要な設計判断：精算の再計算を SQL へ移す

`recomputeSettlements`（`settlements.ts`）は今こうなっている:

1. `expenses` + `expense_splits` を読む
2. TS の `calculateSettlementTransfers`（`lib/domain/settlement/settlement.ts:198`）で送金リストを計算
   （各参加者の純収支を出し、債権者↔債務者を貪欲マッチング。約 60 行）
3. unpaid な `settlements` を delete
4. 新しい送金リストを insert
5. `plans.settlement_status` を update

**3〜5 だけを RPC 化しても、費用の書き込み（1〜2）と別トランザクションになる。**
さらに、計算（2）を TS に残したまま「計算結果を RPC に渡す」方式だと、
2 つの費用編集が同時に来たとき、後から来たリクエストが「相手の費用編集を反映していない
送金リスト」で `settlements` を上書きしうる。

→ **算出ロジック（純収支＋貪欲マッチング）を PL/pgSQL に移植する。**

- `public.recompute_plan_settlements(target_plan_id uuid)` を作る。
  内部で plan 行を `FOR UPDATE` ロック → `expenses` / `expense_splits` を読む →
  純収支を集計 → 送金リストを算出 → unpaid `settlements` を delete → insert →
  `plans.settlement_status` を update。すべて 1 トランザクション・1 ロック下。
- 費用の作成・編集・削除 RPC は、expense/splits を書いたあと同じ関数を呼ぶ（同一トランザクション内）。
- TS の `calculateSettlementTransfers` は**残す**。プレビュー表示（費用入力中の「精算はこうなる」）に使う。
  ただし DB に保存される精算の正本は SQL 関数の結果。
- **クロスチェックテスト**を追加: 同じ入力（参加者・費用・分担）に対して
  SQL 関数と TS 関数が同じ送金リストを返すことを、複数パターンで検証する。
  端数（1 円単位）・債権者/債務者が複数・収支ゼロなどの境界を含める。

移植対象は約 60 行の素直なアルゴリズム（浮動小数なし、円単位の整数演算）。
`validateIndividualSplits` 相当のチェック（分担合計＝費用額）も関数内で `raise exception` する。

## RPC 一覧（粒度：ユーザー操作 1 つ = RPC 1 つ）

| RPC | 置き換える Server Action | トランザクション内容 |
|---|---|---|
| `create_plan_with_children(...)` | `createPlanAction`（plans.ts:74） | plan insert → participants / candidate_dates / share_links / plan_reminder_settings insert |
| `replace_plan_schedule(...)` | `updatePlanAction`（plans.ts:147） | plan update（`FOR UPDATE`）→ availability_answers delete → candidate_dates delete → candidate_dates insert → plan_reminder_settings upsert |
| `recompute_plan_settlements(target_plan_id)` | `recomputeSettlements` 内部関数 | 上記「重要な設計判断」参照。他の費用 RPC から呼ばれる |
| `create_expense(...)` | `createExpenseAction`（settlements.ts:336） | plan `FOR UPDATE` → expenses insert → expense_splits insert → `recompute_plan_settlements` |
| `update_expense(...)` | `updateExpenseAction`（settlements.ts:409） | plan `FOR UPDATE` → expenses update → expense_splits delete → insert → `recompute_plan_settlements` |
| `delete_expense(...)` | `deleteExpenseAction`（settlements.ts:509） | plan `FOR UPDATE` → expenses delete → `recompute_plan_settlements` |
| `record_settlement_payment(...)` | `recordSettlementPaymentAction`（settlements.ts:530） | settlement `FOR UPDATE` → 残額チェック → settlement_payments insert → settlements status/paid_at update → plans.settlement_status update。通知・監査は RPC の外（副作用なので成功後に実行） |
| `finalize_account_withdrawal(target_user_id)` | `withdrawAccountAction` の DB 部分（account.ts:55-92） | 下記「退会」参照 |

- 権限チェックは各 RPC 冒頭で。所有者限定操作は `plans.owner_user_id = auth.uid()` を関数内で確認し、
  一致しなければ `raise exception`。`security definer` なので RLS を跨ぐぶん、ここを厳格にする。
- `record_settlement_payment` の「支払い金額が残額を超える」チェックも関数内へ移す（今は TS 側）。

## 退会（`finalize_account_withdrawal`）

外部呼び出し（`admin.auth.admin.updateUserById`、`admin.storage...remove`）があるので
全体を 1 トランザクションにはできない。段階を分ける。

1. **マイグレーション**: `profiles` に `deletion_state text not null default 'active'`
   （`active` / `pending` / `done`）を追加。**個別承認（スキーマ変更）**。
2. `withdrawAccountAction` の流れ:
   - a. `profiles.deletion_state = 'pending'`、`deleted_at`、`nickname` 匿名化を 1 つの小 RPC で（または既存の update に集約）。
   - b. `finalize_account_withdrawal(target_user_id)` RPC — つながり・お気に入り・ブロック・招待・通知・下書き・
     カレンダー連携の delete、`event_members.display_name` 匿名化、`profiles.deletion_state = 'done'` を
     **1 トランザクション**で。各 delete の件数は問わない（0 件でも正常）。
   - c. storage のアバター削除（失敗しても致命的でない。ログのみ）。
   - d. `markAccountWithdrawn`（app_metadata、High 1 で追加済み）。
   - e. `supabase.auth.signOut()`。
3. b が失敗した場合、`deletion_state` は `pending` のまま。
   - 再度退会を試みると `pending` を検出して b から再実行（b は冪等：delete は繰り返し可、匿名化も再代入で可）。
   - middleware / `getCurrentActiveUser` は High 1 の `app_metadata` 印で退会を判定するので、
     `pending` 状態でもアプリには入れない（d がまだなら入れてしまう → 順序を d より前に app_metadata を
     書く形に調整するか、`deletion_state != 'active'` も退会扱いにする。**実装時に確定**）。

※ High 1 で `user_metadata.withdrawn_at` は廃止済み。ここでは `deletion_state` と
`app_metadata.withdrawn_at` の関係だけ整理する。

## Server Action 側の変更

各アクションは「バリデーション → 権限の一次チェック（軽く）→ `supabase.rpc(...)` → エラーを `failWith` /
`errorState` → `revalidatePath` → `redirect`」に単純化される。
`recomputeSettlements` の TS 実装は削除（プレビュー用に `calculateSettlementTransfers` は残す）。

## テスト

- **実 PostgreSQL の統合テスト**（High 3 で CI に入る `supabase/postgres` サービスを使う）:
  - 各 RPC が正常系で期待どおり書くこと。
  - 制約違反や `raise exception` を注入して、**部分的な書き込みが残らない**こと（ロールバック）。
  - `create_expense` / `update_expense` の同時実行で `settlement_payments` 合計がガード（migration 021）を
    超えないこと。plan ロックで直列化されること。
  - `recompute_plan_settlements`（SQL）と `calculateSettlementTransfers`（TS）のクロスチェック。
  - 退会 `finalize_account_withdrawal` を途中で失敗させ、再実行で `done` に到達すること。
- 既存の Server Action 単体テストは RPC 呼び出しに合わせて期待値を更新（RED を確認してから）。
- 失敗テストのスキップ・削除はしない。

## 実施順序（RPC ごとに PR）

High 3 のマージ後に着手（実 DB テストの土台が要る）。

1. `recompute_plan_settlements`（SQL 移植 + クロスチェックテスト）— 他の費用 RPC の前提。
2. `create_expense` / `update_expense` / `delete_expense` — 1 の関数を呼ぶ。
3. `record_settlement_payment`。
4. `create_plan_with_children`。
5. `replace_plan_schedule`。
6. `profiles.deletion_state` マイグレーション + `finalize_account_withdrawal` + 退会アクション改修。

各マイグレーション（`041_` 以降）の SQL は、その PR の設計メモに載せて個別承認を取ってから追加する。

## 決定（2026-08-31）

1. **精算アルゴリズムを PL/pgSQL に移植する。** `recompute_plan_settlements(plan_id)` を SQL 化し、
   費用の書き込みと精算再計算を同一トランザクション・同一ロック下に置く。
   TS の `calculateSettlementTransfers` はプレビュー表示用に残し、SQL 版との一致をテストで担保する。
2. **RPC 粒度は「ユーザー操作 1 つ = RPC 1 つ」。** 上の RPC 一覧のとおり 8 本。
3. **`profiles.deletion_state`（`active` / `pending` / `done`）を追加する**（マイグレーション 041）。

### PR の分け方（RPC ごと、ただし密結合はまとめる）

- PR A: `recompute_plan_settlements`（SQL 移植 + クロスチェックテスト）+ `create_expense` /
  `update_expense` / `delete_expense` + 対応する Server Action 改修。
- PR B: `record_settlement_payment`。
- PR C: `create_plan_with_children` + `replace_plan_schedule`。
- PR D: `profiles.deletion_state`（041）+ `finalize_account_withdrawal` + 退会アクション改修。
