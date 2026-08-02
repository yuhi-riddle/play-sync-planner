# 清算時の支払い方法を参加者単位でまとめる 設計

日付: 2026-08-02
ステータス: 承認済み

## 目的

現在、支払い方法の入力が3箇所に分散している。

1. 立替を追加するたび（`expenses.payment_method`）
2. 清算計算後、受け取り側が「受け取り方法を設定」するとき（`settlements.payment_method`）。清算ペアごとの入力
3. 支払う側が「支払った金額を記録」するとき（`settlement_payments.payment_method`）。清算ペアごとの入力

清算計算（`calculateSettlementTransfers`）は最小送金回数になるよう貪欲法で組むため、1人が複数の清算ペアを持つことが珍しくない。その結果、同じ人が同じ支払い方法を何度も入力させられる。

清算計算の性質上、1人の参加者は「受け取る側（creditor）」か「払う側（debtor）」のどちらか一方にしかならない（両方になることはない）。この事実を使い、支払い方法は**参加者1人につき1箇所**で設定できるようにする。1の立替追加時の入力は廃止する。

## 対象

- `/plans/[planId]/settlement`（主催者向け管理画面）
- `/s/[token]/settlement`（参加者向け公開画面、`components/public-settlement-summary.tsx`）
- `components/expense-form.tsx`（立替の追加・編集フォーム）

## 対象外

- 送金先URL・メモは今回もペアごとの個別入力のまま。PayPayリンクなど相手ごとに出したい情報も含むため、まとめる対象を支払い方法だけに絞る
- 清算計算ロジック（`lib/domain/settlement.ts` の `calculateSettlementTransfers`）は変更しない。支払い方法は計算結果に一切関与しない
- `payment_proofs` テーブル（未使用）には触れない

## データモデル

`participants` テーブルに `settlement_payment_method text`（nullable）を追加する（マイグレーション `025_participant_settlement_payment_method.sql`）。

既存の `expenses.payment_method` / `settlements.payment_method` / `settlement_payments.payment_method` カラムはそのまま残す。削除せず、書き込まれ方だけが変わる。

- `expenses.payment_method`: 今後は書き込まれない（フォームから入力欄を削除するため）。既存データはそのまま残る
- `settlements.payment_method`: 今後は書き込まれない。表示は常に受け取り側 participant の `settlement_payment_method` を参照する
- `settlement_payments.payment_method`: 支払い記録のたびに、記録した participant の `settlement_payment_method` をその時点でコピーして保存する。後で参加者が設定を変えても、過去の記録は変わらない（履歴としての性格を保つ）

### 既存データの移行

`settlements.payment_method` に値が入っている行から、受け取り側 participant の `settlement_payment_method` へバックフィルする。同一 participant に複数の異なる値がある場合は、直近の `paid_at`（無ければ `created_at`）を優先する。

`codex/performance-security-foundation` ブランチ（未マージ）も `025` 以降の番号を使う予定になっている。マージ時にどちらかの番号を採番し直す調整が必要。

## UI

### 「あなたの支払い方法」ブロック（新設）

管理画面・公開画面それぞれの「清算結果」カードの直前に配置する。関わる清算ペアを見て、受け取る側か払う側かを判定し、該当する1件のフォームを出す。

- 関与する清算ペアが無ければ表示しない
- 受け取る側なら「受け取り方法」、払う側なら「支払い方法」とラベルを出し分ける
- 保存すると、その participant が関わる全ての清算ペアの表示・以降の記録に反映される

### 管理画面での本人判定

ログイン中の主催者本人（`plan.owner_user_id`）を `participants.user_id` と突き合わせ、該当する participant を特定する。主催者が参加者としてもイベントに加わっているケースを想定した既存の `isOwner`/`canManage` 判定パターンをそのまま使う。

### 公開画面での本人判定

`/s/[token]/settlement` にはログイン不要でアクセスできるため、閲覧者がどの participant かを判定する仕組みがそもそも無い（既存の `recordPublicSettlementPaymentAction` も本人確認をしていない）。日程調整の回答フォーム（`submitAvailabilityAnswersAction` → `resolveAnswerParticipantForSubmission`、`lib/domain/participant-identity.ts`）と同じ考え方を流用する。

- ログイン中なら、ログインユーザーの `user_id` と一致する participant を自動的に「あなた」として扱う
- 未ログインなら、その plan の participant 一覧から表示名を選ばせる `<select>` を出し、選択された participant を「あなた」として扱う
- 「あなた」が定まったら、その participant が受け取る側か払う側かで「あなたの支払い方法」ブロックの内容を出し分ける

認可については、既存の `recordPublicSettlementPaymentAction` と同水準（トークンが有効で、対象 participant が同じ plan に属していることだけを見る。参加者間でパスワード等による相互認証はしていない）を踏襲する。これは今回の変更で新たに緩めるものではなく、既存のセキュリティモデルをそのまま維持するという判断。

### 清算ペアごとの表示の変更

- 「受け取り方法を設定」フォーム（`SettlementActions` 内）から支払い方法欄を削除。送金先URL・メモの入力は残す
- 表示側（`getPaymentInstructionView` の呼び出し元）は、`settlement.payment_method` の代わりに受け取り側 participant の `settlement_payment_method` を渡す
- 「支払った金額を記録」フォームから支払い方法欄を削除。金額・支払い記録URL・メモの入力は残す

### 立替追加・編集フォーム（`ExpenseForm`）

`PaymentMethodField` の呼び出しを削除する。`payment_method` に関するバリデーション（`lib/validators.ts` の `expenseSchema`）もフォーム入力を前提にしない形に変える。

## Server Actions

- 新規: participant の `settlement_payment_method` を更新するアクション（管理画面用・公開画面用の2系統。既存の `updateSettlementPaymentInstructionAction` / 公開画面側アクションの認可パターンを踏襲する）
- `updateSettlementPaymentInstructionAction`: `payment_method` の引数を除去し、URL・メモのみ更新する
- `recordSettlementPaymentAction` / `recordPublicSettlementPaymentAction`: フォームから `payment_method` の入力を除去し、記録する participant の `settlement_payment_method` を読み取って `settlement_payments.payment_method` に保存する
- `createExpenseAction` / `updateExpenseAction`: `payment_method` を受け取らない（`expenseSchema` 側の変更に追随）

## テスト

- `expense-form` 関連テスト: 支払い方法欄が表示されないことを確認する形に更新
- `settlement-page` / `public-settlement-summary` 関連テスト: 「あなたの支払い方法」ブロックの表示・保存・清算ペアへの反映を検証するテストを追加。公開画面はログイン中の自動判定と未ログイン時の名前選択の両方をカバーする
- `validators.test.ts`: `expenseSchema` から `payment_method` が外れたことを反映
- 新規: participant の `settlement_payment_method` 更新アクションのテスト（認可: 本人または主催者のみ更新できることを含む）
- 既存の `domain/settlement.test.ts` は変更不要（計算ロジックに手を入れないため）

## 今回やらないこと

- 送金先URL・メモの参加者単位への統合
- 支払い方法の候補（PayPay / 銀行振込 / 現金）を enum 化する変更（現状どおり自由入力のテキストのまま）
- `payment_proofs` テーブルの整理
