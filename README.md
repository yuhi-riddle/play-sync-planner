# Madoi

Madoi は、友人同士の遊びや公演参加の日程を合わせるための Web アプリです。

リポジトリ名と開発プロジェクト名は `play-sync-planner` のままです。画面上のサービス名は、ユーザーに伝わりやすいように `Madoi` としています。

## コンセプト

まずは日程調整に集中します。候補日時を作り、参加者に回答してもらい、日程を確定する流れを軽くします。

後続 Phase では、Google Calendar への予定登録、リマインド、清算などを足していく想定です。

## 現在できること

- イベント登録
- 参加予定作成
- 候補日時登録
- 日程回答
- 日程確定
- 共有リンクによる未ログイン回答
- 調整カレンダー
- 参加者管理
- 利用規約・プライバシーポリシーのドラフト表示
- Google Calendar の予定確認

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
```

Supabase の SQL Editor で、マイグレーションを順番に実行します。

```text
supabase/migrations/001_phase1_schema.sql
supabase/migrations/002_calendar_integrations.sql
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

## Phase 2 Google Calendar 連携

候補日時作成画面で、自分の Google Calendar の予定名・場所・時間を確認できます。日程を確定すると、確定した日程を Google Calendar に予定として追加します。

取得するのは予定の開始・終了時刻、予定名、場所だけです。予定の説明、参加者、Meet URL、添付ファイルは取得しません。Google Calendar の予定詳細はデータベースに保存しません。
## Phase 2 ホーム月カレンダー

ホーム画面では、Madoiの調整中候補、確定済み予定、Google Calendarの予定を同じ月カレンダーに表示します。

- 調整中: 黄色の点
- 確定済み: 緑の点
- Google Calendar: 青の点

日付を選ぶと、その日の予定をタイムラインで確認できます。Google Calendarの予定は画面表示後に取得し、予定名・場所・時間を表示します。
## Phase 2 回答画面のGoogle Calendar確認

共有リンクの日程回答画面では、ログイン済みかつGoogle Calendar連携済みの場合、自分の予定と候補日時の重なりを確認しながら回答できます。

- 候補日時とGoogle Calendar予定が重なる場合は注意表示を出す
- 予定名、場所、時間を表示する
- 未ログイン、未連携、取得失敗の場合でも回答は続けられる
- Google Calendarの予定詳細はDBに保存しない
## Phase 2 日程確定の判断画面

予定詳細と日程確定画面では、候補日時をランキング表示します。

- ○が多い候補を優先する
- 同数なら△が多い候補を優先する
- ×と未回答が少ない候補を上に出す
- おすすめ、未回答あり、スコア、回答率を表示する
- 確定前に確認ダイアログを出す
