# Madoi

Madoi は、友人同士の遊びや公演参加の日程を合わせるための Web アプリです。

リポジトリ名と開発プロジェクト名は `play-sync-planner` のままです。画面上のサービス名は、ユーザーに伝わりやすいように `Madoi` としています。

## コンセプト

まずは日程調整に集中します。候補日時を作り、参加者に回答してもらい、日程を確定する流れを軽くします。

後続 Phase では、外部決済リンクの強化、通知連携などを足していく想定です。

## 現在できること

- イベント登録
- 参加予定作成
- 候補日時登録
- 日程回答
- 日程確定
- 共有リンクによる未ログイン回答
- 主催者自身の回答導線
- 調整カレンダー
- 参加者管理
- 利用規約・プライバシーポリシーのドラフト表示
- Google Calendar の予定確認
- 未回答者の確認とリマインド文面コピー
- 回答期限前の複数リマインダー設定
- リマインド送信済み記録
- 終日候補の作成・表示・Google Calendar登録
- 確定済み予定のGoogle Calendar作成と連携済み参加者への招待
- 支払い履歴追加
- 均等割り・個別金額による清算計算
- 清算の支払い済み・受け取り確認
- 立替支払いの編集・削除
- 重要メモとして残す支払い履歴
- 一部清算支払いの記録
- 清算支払いごとの受け取り確認
- 清算状況サマリー
- 支払いURLを開く導線
- 支払い依頼文面コピー
- 清算リマインド文面コピーと送信済み記録
- サイト内通知
- ホームとヘッダーでの未読通知表示
- ホームでの対応事項フィルター
- 通知画面での未読・既読フィルター

## 技術スタック

- Next.js App Router
- React
- TypeScript
- Supabase Auth / Supabase Postgres
- Server Actions
- Tailwind CSS
- Zod
- Vitest

## セットアップ

```bash
npm install
```

`.env.example` を参考に `.env.local` を作成します。

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=
```

Supabase の SQL Editor で、マイグレーションを順番に実行します。

```text
supabase/migrations/001_phase1_schema.sql
supabase/migrations/002_calendar_integrations.sql
supabase/migrations/003_plan_reminder_settings.sql
supabase/migrations/004_plan_reminder_logs.sql
supabase/migrations/005_settlement_core.sql
supabase/migrations/006_settlement_payments.sql
supabase/migrations/007_expense_important_notes.sql
supabase/migrations/008_settlement_reminder_type.sql
supabase/migrations/009_site_notifications.sql
```

Google Calendar 連携を使う場合は、次の手順も実施してください。

```text
docs/phase2-google-calendar-setup.md
```

## 起動

```bash
npm run dev
```

## 確認

```bash
npm test
npm run build
```

## ドキュメント

- `docs/design/01_requirements.md`: 要件定義書
- `docs/design/02_database_design.md`: DB設計
- `docs/design/03_screen_flow.md`: 画面フロー
- `docs/design/04_codex_phase1_prompt.md`: Phase 1 実装指示
- `docs/phase1-user-setup.md`: Phase 1 セットアップ手順
- `docs/phase1-completion-checklist.md`: Phase 1 完了チェック
- `docs/phase2-google-calendar-setup.md`: Google Calendar セットアップ手順
- `docs/current-status.md`: 現在の実装状況、残件、リリース前チェックリスト
- `docs/release-checklist.md`: ローカル・本番公開前の確認手順

## Phase 2 Google Calendar 連携

候補日時作成画面で、自分の Google Calendar の予定名・場所・時間を確認できます。日程確定後は、予定詳細の「Calendarに作成して招待」から主催者のGoogle Calendarに予定を作成できます。Google Calendar連携済みの参加者がいれば、カレンダー招待も送ります。

取得するのは予定の開始・終了時刻、予定名、場所だけです。予定の説明、参加者、Meet URL、添付ファイルは取得しません。Google Calendar の予定詳細はデータベースに保存しません。
## Phase 2 ホーム日付表示と調整カレンダー

ホーム画面では、選択した1日のMadoi予定とGoogle Calendar予定だけを表示します。今日、明日、週末、任意の日付で絞り込めます。月単位の俯瞰は `/plans` の調整カレンダーで行います。

- 調整中: 黄色の点
- 確定済み: 緑の点
- Google Calendar: 青の点

調整カレンダーでは、同時進行の候補日時を月単位で見比べます。Google Calendarの予定は画面表示後に取得し、予定名・場所・時間を表示します。
## Phase 2 回答画面のGoogle Calendar確認

共有リンクの日程回答画面では、ログイン済みかつGoogle Calendar連携済みの場合、自分の予定と候補日時の重なりを確認しながら回答できます。

- 候補日時とGoogle Calendar予定が重なる場合は注意表示を出す
- 予定名、場所、時間を表示する
- 未ログイン、未連携、取得失敗の場合でも回答は続けられる
- Google Calendarの予定詳細はDBに保存しない
## Phase 2 日程確定の判断画面

予定詳細と日程確定画面では、候補日時をランキング表示します。

## Phase 2 未回答者とリマインド文面

予定詳細画面では、まだ回答していない参加者を確認できます。未回答者に送るための文面を生成し、共有リンクと回答期限を含めてコピーできます。

外部サービスへの自動送信はまだ行いません。送信はLINE、メール、Discordなど、ユーザーが普段使っている手段で手動で行う前提です。

## Phase 2 終日候補

候補日時作成画面では、候補を終日として追加できます。終日候補は `candidate_dates.is_all_day` に保存し、予定詳細、回答画面、日程確定画面、ホームの日付表示で終日として表示します。

終日候補を確定した場合、Google Calendarには `date` 形式の終日予定として作成します。

- ○が多い候補を優先する
- 同数なら△が多い候補を優先する
- ×と未回答が少ない候補を上に出す
- おすすめ、未回答あり、スコア、回答率を表示する
- 確定前に確認ダイアログを出す

## Phase 2 リマインダー設定

参加予定ごとに、回答期限の何分前・何時間前・何日前に声をかけるかを複数件保存できます。現時点では自動送信は行わず、参加予定詳細の表示と未回答者向けリマインド文面に反映します。

## Phase 2 リマインド送信済み記録

未回答者に手動で連絡したあと、参加予定詳細から「送信済みに記録」できます。記録した回数と前回の送信時刻を表示します。LINE、メール、Discordなどへの自動送信はまだ行いません。

## Phase 3-A 清算

参加予定ごとに支払い履歴を追加し、均等割りまたは個別金額で負担額を登録できます。登録した支払いから、誰が誰にいくら払うかを自動計算します。

- 支払い履歴を追加する
- 支払った人と負担者を選ぶ
- 均等割りでは1円単位の端数を参加者順に配る
- 個別金額では合計が支払い金額と一致しない場合は保存しない
- 清算ごとに支払い済み、受け取り確認を記録する
- 支払い方法メモと支払い用URLを保存できる
- 未払いの清算リマインド文面をコピーし、送信済みとして記録できる

外部決済サービスへの直接連携、自動リマインド送信はまだ行いません。

## Phase 3-B 清算の運用改善

清算支払いを始める前であれば、立替支払いを編集・削除できます。清算支払いは別履歴として保存し、一部支払いにも対応します。

- 立替支払いの入力ミスを編集・削除できる
- 清算支払いが1件でも記録された後は、立替支払いの変更をロックする
- 予約番号や当日必要な情報を、重要メモとして支払い履歴に残せる
- 清算支払いを一部金額で記録できる
- 支払いごとに支払い方法、URL、メモを保存できる
- 支払いごとに受け取り確認できる
- 未払いリマインドは残額ベースで作る
- 清算残額、支払い済み額、受け取り確認済み額をまとめて確認できる

外部決済APIとの直接連携はまだ行いません。保存した支払いURLや購入ページURLを開く導線だけ用意しています。

## Phase 3-C 支払い依頼の手動送信補助

清算ごとに支払い方法、支払い先URL、メモを保存できます。未払いの人に送る支払い依頼文面には、残額と支払い先情報を含めます。

- 支払い先メモを清算ごとに保存できる
- 支払い依頼文面をコピーできる
- 支払い依頼の送信済み記録を残せる

PayPayなどの外部決済API連携、支払い依頼の自動送信、入金確認の自動化はまだ行いません。

## サイト内通知

Madoi内で、未回答、回答期限、清算待ち、支払い待ち、受け取り確認待ちを通知として表示します。

- ヘッダーに未読件数を表示する
- 日程回答が送信されたら、主催者へ即時にサイト内通知を作成する
- ホームに対応が必要な通知を表示し、期限、未回答、清算、支払い、確認待ちで絞り込める
- `/notifications` で通知一覧を確認する
- 既読、すべて既読にできる
- 通知生成APIを Vercel Cron から1時間ごとに実行する
- 回答期限前のサイト内通知は、参加予定ごとの複数リマインド設定に沿って生成する

本番で通知生成APIを手動実行できないようにしたい場合は、`CRON_SECRET` を設定してください。未設定の場合、本番では Vercel Cron の User-Agent だけを許可します。
