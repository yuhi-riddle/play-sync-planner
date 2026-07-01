# 遊び予定の調整・清算管理アプリ DB設計 v1.0

## 1. DB設計方針

本アプリでは、最初のMVPを謎解き公演向けに作る。  
ただし、内部設計はライブ、旅行、飲み会、スノボ、ボードゲーム会などにも拡張できるようにする。

## 2. ER構造概要

```text
users
 ├─ events
 │   └─ plans
 │       ├─ candidate_dates
 │       │   └─ availability_answers
 │       ├─ participants
│       ├─ expenses
│       │   └─ expense_splits
│       ├─ settlements
│       │   ├─ settlement_payments
│       ├─ settlement_reminder_logs
 │       ├─ reminders
 │       └─ share_links
 └─ calendar_integrations
```

## 3. テーブル一覧

## users

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | ユーザーID |
| display_name | text | yes | 表示名 |
| email | text | yes | メールアドレス |
| avatar_url | text | no | アイコンURL |
| auth_provider | text | yes | googleなど |
| provider_user_id | text | yes | Google側ユーザーID |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## events

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | イベントID |
| owner_user_id | uuid | yes | 作成者ユーザーID |
| category | text | yes | イベントカテゴリ |
| title | text | yes | イベント名 |
| url | text | no | 公式URLなど |
| location_name | text | no | 会場名・場所名 |
| address | text | no | 住所 |
| start_date | date | no | 開催開始日 |
| end_date | date | no | 開催終了日 |
| price | integer | no | 目安料金 |
| capacity | integer | no | 定員 |
| status | text | yes | イベント状態 |
| memo | text | no | メモ |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

category 候補：

- nazotoki
- live
- travel
- drinking
- snowboard
- boardgame
- movie_stage
- other

status 候補：

- interested
- planning
- confirmed
- done
- cancelled
- skipped

## plans

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 参加予定ID |
| event_id | uuid | yes | 紐づくイベントID |
| owner_user_id | uuid | yes | 主催者ユーザーID |
| title | text | no | 参加予定名 |
| status | text | yes | 参加予定状態 |
| confirmed_start_at | timestamptz | no | 確定開始日時 |
| confirmed_end_at | timestamptz | no | 確定終了日時 |
| is_all_day | boolean | yes | 終日予定か |
| answer_deadline_at | timestamptz | no | 回答期限 |
| settlement_status | text | yes | 清算状態 |
| ticket_status | text | yes | チケット状態 |
| google_calendar_event_id | text | no | 登録済みGoogle予定ID |
| memo | text | no | メモ |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

status 候補：

- draft
- collecting_answers
- date_confirmed
- ticket_purchased
- settling
- settled
- participated
- cancelled
- skipped

## participants

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 参加者ID |
| plan_id | uuid | yes | 参加予定ID |
| user_id | uuid | no | ログインユーザーID |
| display_name | text | yes | 表示名 |
| participant_type | text | yes | 参加者種別 |
| status | text | yes | 参加状態 |
| is_organizer | boolean | yes | 主催者か |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

participant_type 候補：

- registered
- guest

status 候補：

- invited
- answered
- confirmed
- waitlisted
- declined
- cancelled

## candidate_dates

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 候補日ID |
| plan_id | uuid | yes | 参加予定ID |
| start_at | timestamptz | yes | 候補開始日時 |
| end_at | timestamptz | no | 候補終了日時 |
| is_all_day | boolean | yes | 終日候補か |
| memo | text | no | 補足 |
| sort_order | integer | yes | 表示順 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## availability_answers

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 回答ID |
| candidate_date_id | uuid | yes | 候補日ID |
| participant_id | uuid | yes | 参加者ID |
| answer | text | yes | 回答 |
| comment | text | no | コメント |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

answer 候補：

- yes
- maybe
- no
- unanswered

制約：

- candidate_date_id + participant_id はユニーク

## expenses

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 支払い履歴ID |
| plan_id | uuid | yes | 参加予定ID |
| payer_participant_id | uuid | yes | 支払者 |
| title | text | yes | 費目名 |
| category | text | yes | 費目カテゴリ |
| amount | integer | yes | 金額 |
| paid_at | timestamptz | no | 支払日時 |
| memo | text | no | メモ |
| payment_method | text | no | 支払い方法メモ |
| payment_url | text | no | 支払い用URL |
| is_important | boolean | yes | 重要メモとして表示するか |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## expense_splits

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 負担ID |
| expense_id | uuid | yes | 支払い履歴ID |
| participant_id | uuid | yes | 負担者 |
| amount | integer | yes | 負担額 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## settlements

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 清算ID |
| plan_id | uuid | yes | 参加予定ID |
| from_participant_id | uuid | yes | 支払う人 |
| to_participant_id | uuid | yes | 受け取る人 |
| amount | integer | yes | 支払う金額 |
| status | text | yes | 清算状態 |
| calculated_at | timestamptz | yes | 計算日時 |
| paid_at | timestamptz | no | 支払い済み登録日時 |
| confirmed_at | timestamptz | no | 受け取り確認日時 |
| payment_method | text | no | 支払い方法メモ |
| payment_url | text | no | 支払い用URL |
| memo | text | no | 支払いメモ |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

status 候補：

- unpaid
- paid
- confirmed

## settlement_payments

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 清算支払いID |
| settlement_id | uuid | yes | 清算ID |
| paid_by_participant_id | uuid | no | 支払った参加者 |
| amount | integer | yes | 支払い金額 |
| payment_method | text | no | 支払い方法メモ |
| payment_url | text | no | 支払い用URL |
| memo | text | no | メモ |
| paid_at | timestamptz | yes | 支払い記録日時 |
| confirmed_at | timestamptz | no | 受け取り確認日時 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

用途：

- 清算に対する実際の支払い履歴を保存する
- 一部支払いを扱うため、1つの `settlements` に複数行を持てる
- 支払いごとに受け取り確認する
- 支払い合計が `settlements.amount` を超えないようアプリ側で検証する

## payment_proofs deprecated

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 証拠ID |
| settlement_id | uuid | yes | 清算ID |
| uploaded_by_participant_id | uuid | no | 登録者 |
| proof_type | text | yes | 証拠種別 |
| proof_url | text | no | 証拠URL |
| memo | text | no | 証拠メモ |
| payment_method | text | no | 支払い方法 |
| paid_at | timestamptz | no | 支払い日時 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

proof_type 候補：

- memo_url
- image_url

現在の画面では使用しない。支払い証拠画像アップロードは実装対象から外し、予約番号や当日必要な情報は `expenses.memo` と `expenses.is_important` で扱う。

## settlement_reminder_logs

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 清算リマインド記録ID |
| plan_id | uuid | yes | 参加予定ID |
| actor_user_id | uuid | no | 記録したユーザー |
| recipient_names | text[] | yes | 送信先名 |
| reminder_message | text | no | 送信した文面 |
| sent_at | timestamptz | yes | 送信記録日時 |
| created_at | timestamptz | yes | 作成日時 |

## reminders

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | リマインドID |
| plan_id | uuid | yes | 参加予定ID |
| reminder_type | text | yes | リマインド種別 |
| scheduled_at | timestamptz | yes | 通知予定日時 |
| target_type | text | yes | 通知対象 |
| message | text | no | 通知文 |
| sent_at | timestamptz | no | 送信日時 |
| status | text | yes | 状態 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## share_links

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 共有リンクID |
| plan_id | uuid | yes | 参加予定ID |
| token | text | yes | 推測困難なトークン |
| purpose | text | yes | 用途 |
| expires_at | timestamptz | no | 有効期限 |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## calendar_integrations

| カラム名 | 型 | 必須 | 説明 |
|---|---|---:|---|
| id | uuid | yes | 連携ID |
| user_id | uuid | yes | ユーザーID |
| provider | text | yes | google |
| calendar_id | text | no | カレンダーID |
| access_token | text | yes | アクセストークン |
| refresh_token | text | no | リフレッシュトークン |
| token_expires_at | timestamptz | no | トークン期限 |
| scope | text | no | 権限スコープ |
| created_at | timestamptz | yes | 作成日時 |
| updated_at | timestamptz | yes | 更新日時 |

## 4. 清算計算ロジック

1. 参加者ごとに paid_total を計算する
2. 参加者ごとに owed_total を計算する
3. balance = paid_total - owed_total を計算する
4. balance > 0 の人を受け取り側とする
5. balance < 0 の人を支払い側とする
6. 支払い側から受け取り側へ、金額が相殺されるようにsettlementsを作成する

## 5. MVP時点の実装優先度

Phase 1：

- users
- events
- plans
- participants
- candidate_dates
- availability_answers
- share_links

Phase 2：

- calendar_integrations
- plan_reminder_settings
- plan_reminder_logs

Phase 3-A：

- expenses
- expense_splits
- settlements
- settlement_reminder_logs

Phase 3-B：

- settlement_payments
- expenses.is_important

後続Phase：

- reminders
