# Madoi Phase 1 完了判定

最終更新: 2026-06-28

## 判定

Phase 1 は、実装範囲の主要機能を満たしています。

ただし、スクリーンショット確認や実ブラウザでの目視確認は、この記録では実施していません。必要な場合は、ユーザーが明示したタイミングで行います。

## 実装済み

- Googleログイン
- 予定登録
- 予定編集
- 予定一覧
- 予定管理
- 日程調整作成
- 日程調整編集
- 候補日時登録
- 回答期限登録
- 参加者管理
- 共有リンク生成
- 未ログイン回答
- 日程回答
- 日程確定
- 調整カレンダー
- 利用規約ドラフト
- プライバシーポリシードラフト

補足:

- 終日候補はDBカラムのみ準備済みです。UIと保存処理は、Google Calendar連携と扱いをそろえるためPhase 2で実装します。

## 画面

- `/`
- `/login`
- `/events`
- `/events/new`
- `/events/:eventId`
- `/events/:eventId/edit`
- `/events/:eventId/plans/new`
- `/plans`
- `/plans/:planId`
- `/plans/:planId/edit`
- `/plans/:planId/confirm`
- `/s/:token/answer`
- `/s/:token/answer/complete`
- `/settings`
- `/terms`
- `/privacy`

## Server Actions

- `signInWithGoogleAction`
- `signOutAction`
- `createEventAction`
- `updateEventAction`
- `createPlanAction`
- `updatePlanAction`
- `submitAvailabilityAnswersAction`
- `confirmPlanAction`

## DB

Phase 1 のマイグレーションは `supabase/migrations/001_phase1_schema.sql` です。

対象テーブル:

- `events`
- `plans`
- `participants`
- `candidate_dates`
- `availability_answers`
- `share_links`

ユーザー管理は Supabase Auth の `auth.users` を使います。

## Phase 1 では実装しない

- Walica風清算
- 支払い履歴
- 支払い証拠
- Google Calendar連携
- Google Calendarの空き状況取得
- 自動候補日時提案
- 終日候補のUI
- リマインド送信
- X連携
- LINE連携
- Discord連携
- アプリ内送金
- PWA通知

## 確認コマンド

```powershell
npm.cmd test
npm.cmd run build
```

## 残る確認

- 実ブラウザで、予定作成から日程確定までの一連の操作を確認する
- スマホ幅での見た目を確認する
- 正式公開前に、利用規約とプライバシーポリシーの運営者情報を埋める

## 次のPhase候補

Phase 2:

- Google Calendar連携
- 自分のGoogle Calendar予定を見ながら候補日時を決める
- 確定日時をGoogle Calendarへ登録する
- 終日候補の入力とGoogle Calendar登録
- 回答期限リマインドの設計

Phase 3:

- Walica風清算
- 支払い履歴
- 支払い証拠
- 支払い確認フロー
