# Codex依頼：PlaySync Planner Phase 1 実装

## 目的

このプロジェクトに、遊び予定の調整・清算管理アプリ「PlaySync Planner」のPhase 1を実装してください。

Phase 1では、清算機能やGoogleカレンダー連携までは実装せず、以下の「日程調整の基礎機能」を作成してください。

- イベント登録
- 参加予定作成
- 参加者管理
- 候補日登録
- 日程回答
- 日程確定
- 共有リンクによる未ログイン回答

このアプリは、最初のMVPでは謎解き公演向けに作ります。  
ただし、将来的にはライブ、旅行、飲み会、スノボ、ボードゲーム会などにも拡張できるよう、DBや内部構造は汎用的にしてください。

---

## 1. 実装前に必ず行うこと

まず、既存プロジェクト構成を確認してください。

確認するもの：

- 使用フレームワーク
- ルーティング構成
- DB接続方法
- 認証方式
- 既存のテーブル・モデル・マイグレーション
- 既存のUIコンポーネント
- 環境変数
- 実行方法
- テスト方法

そのうえで、いきなり実装せず、最初に以下を提示してください。

1. 現在のプロジェクト構成の理解
2. 実装方針
3. 追加・変更するファイル一覧
4. DBマイグレーション方針
5. 画面・APIの追加方針
6. 動作確認手順

既存設計と衝突する場合は、既存設計を優先しつつ、必要な差分を説明してください。

---

## 2. Phase 1の実装対象

Phase 1で実装するテーブルは以下です。

- users
- events
- plans
- participants
- candidate_dates
- availability_answers
- share_links

ただし、既にユーザー認証やusers相当のテーブルが存在する場合は、既存の仕組みに合わせてください。

---

## 3. DB設計

### events

- id
- owner_user_id
- category
- title
- url
- location_name
- address
- start_date
- end_date
- price
- capacity
- status
- memo
- created_at
- updated_at

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

### plans

- id
- event_id
- owner_user_id
- title
- status
- confirmed_start_at
- confirmed_end_at
- is_all_day
- answer_deadline_at
- settlement_status
- ticket_status
- google_calendar_event_id
- memo
- created_at
- updated_at

Phase 1で主に使うstatus：

- draft
- collecting_answers
- date_confirmed
- cancelled
- skipped

### participants

- id
- plan_id
- user_id
- display_name
- participant_type
- status
- is_organizer
- created_at
- updated_at

participant_type：

- registered
- guest

status：

- invited
- answered
- confirmed
- waitlisted
- declined
- cancelled

### candidate_dates

- id
- plan_id
- start_at
- end_at
- is_all_day
- memo
- sort_order
- created_at
- updated_at

### availability_answers

- id
- candidate_date_id
- participant_id
- answer
- comment
- created_at
- updated_at

answer：

- yes
- maybe
- no
- unanswered

制約：

- candidate_date_id + participant_id はユニーク

### share_links

- id
- plan_id
- token
- purpose
- expires_at
- created_at
- updated_at

purpose：

- answer
- summary
- settlement
- payment_request

Phase 1では answer を使用してください。

---

## 4. Phase 1で作る画面

### ホーム画面

パス案：

```text
/
```

表示内容：

- 調整中の予定
- 回答受付中の予定
- 日程確定済みの直近予定
- イベント作成ボタン
- イベント一覧への導線

### イベント一覧画面

パス案：

```text
/events
```

表示内容：

- イベント名
- カテゴリ
- 開催期間
- 場所
- ステータス
- 紐づく参加予定数

### イベント作成・編集画面

パス案：

```text
/events/new
/events/:eventId/edit
```

入力項目：

- カテゴリ
- タイトル
- URL
- 場所
- 開催開始日
- 開催終了日
- 料金
- 定員
- メモ
- ステータス

### イベント詳細画面

パス案：

```text
/events/:eventId
```

表示内容：

- イベント情報
- URL
- 場所
- 開催期間
- 料金
- 定員
- メモ
- ステータス
- 参加予定一覧

### 参加予定作成・編集画面

パス案：

```text
/events/:eventId/plans/new
/plans/:planId/edit
```

入力項目：

- 参加予定名
- 参加者名
- 候補日
- 回答期限
- メモ

### 参加予定詳細画面

パス案：

```text
/plans/:planId
```

表示内容：

- イベント名
- 参加予定名
- ステータス
- 候補日一覧
- 各候補日の回答状況
- 参加者一覧
- 回答期限
- 確定日時
- 共有リンク
- メモ

### 日程回答画面

パス案：

```text
/s/:token/answer
```

要件：

- 未ログインでも回答できること
- 名前を入力して回答できること
- 候補日ごとに yes / maybe / no を登録できること
- 回答後、participant.statusを answered にすること
- 回答期限を過ぎている場合は回答できないようにすること

### 日程確定画面

パス案：

```text
/plans/:planId/confirm
```

要件：

- 主催者のみ確定できること
- 候補日を1つ選んで確定できること
- 確定後、plans.confirmed_start_at / confirmed_end_at を更新すること
- plans.status を date_confirmed にすること
- 対象候補日に yes または maybe と回答した参加者を confirmed にすること
- no の参加者は declined にすること
- イベントのstatusも必要に応じて confirmed に更新すること

---

## 5. 今回は実装しないもの

Phase 1では以下は実装しないでください。

- Walica風清算
- 支払い履歴
- 支払い証拠
- Googleカレンダー連携
- リマインド送信
- X連携
- LINE連携
- Discord連携
- アプリ内送金
- ネイティブアプリ化
- PWA通知

ただし、後続Phaseで追加しやすいように、DBや画面構造は拡張しやすくしてください。

---

## 6. 実装後に提示するもの

実装後、以下を提示してください。

- 変更ファイル一覧
- 追加したDBテーブル
- 追加した画面
- 追加したAPI / Server Actions
- 実装した機能
- 動作確認手順
- 未実装・保留事項
- 次のPhase 2で実装すべき内容
