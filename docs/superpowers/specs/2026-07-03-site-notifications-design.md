# Site Notifications Design

## Goal

Madoi の中だけで、未回答、期限間近、清算待ち、支払い待ち、受け取り確認待ちを見逃しにくくする。

## Scope

- サイト内通知だけを実装する。
- メール、X、LINE、Discord への自動送信は実装しない。
- 通知の送信先はログインユーザー単位にする。
- 参加者ゲスト向けの外部通知は後回しにする。
- 既存の手動リマインドログは残す。

## Design

- `notifications` テーブルを追加する。
- 通知には `user_id`, `kind`, `title`, `body`, `href`, `dedupe_key`, `read_at`, `created_at` を持たせる。
- `dedupe_key` で同じ通知を何度も作らない。
- `/api/cron/notifications` が通知候補を作る。
- `/notifications` で通知一覧を表示する。
- ヘッダーに未読件数付きの通知リンクを置く。
- ホームに最近の未読通知を出す。

## Notification Kinds

- `answer_deadline`: 回答期限が近い
- `unanswered`: 未回答者がいる
- `settlement_needed`: 日程確定後、清算が未開始
- `payment_due`: 支払い待ち
- `confirmation_due`: 受け取り確認待ち

## Scroll

- `html { scroll-behavior: smooth; }` を使う。
- `prefers-reduced-motion: reduce` ではスムーススクロールを無効にする。
