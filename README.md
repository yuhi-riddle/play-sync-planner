# Madoi

## 概要

Madoi は、友人同士の遊び予定について、候補日時を出し、参加者に回答してもらい、日程を確定するためのWebアプリです。

リポジトリ名と開発プロジェクト名は `play-sync-planner` のままです。

最初のMVPでは謎解き公演向けに作成します。  
ただし、将来的にはライブ、旅行、飲み会、スノボ、ボードゲーム会などにも拡張できる設計とします。

## コンセプト

まずは日程調整に集中し、複数の予定調整を見比べやすくする。後続Phaseで、Googleカレンダー連携やWalica風清算を足していく。

## Phase 1の中心機能

- 予定登録
- 日程調整作成
- 候補日登録
- 日程回答
- 日程確定
- 共有リンク
- 調整カレンダー
- 参加者管理
- 利用規約・プライバシーポリシーのドラフト表示

Googleカレンダー連携、リマインド、清算、支払い証拠管理は後続Phaseで実装します。

## ファイル構成

- `docs/design/01_requirements.md`：要件定義書 v1.1
- `docs/design/02_database_design.md`：DB設計 v1.0
- `docs/design/03_screen_flow.md`：画面一覧・画面遷移 v1.1
- `docs/design/04_codex_phase1_prompt.md`：Codex Phase 1 実装プロンプト
- `docs/phase1-user-setup.md`：Phase 1 セットアップ手順
- `docs/phase1-completion-checklist.md`：Phase 1 完了判定

## 開発方針

1. 要件定義を確定する
2. DB設計を確定する
3. 画面一覧・画面遷移を確定する
4. CodexにPhase 1実装を依頼する
5. Phase 2でGoogleカレンダー連携を実装する
6. Phase 3でWalica風清算を実装する

## Phase 1 開発メモ

### 技術スタック

- Next.js App Router
- React
- TypeScript
- Supabase Auth / Supabase Postgres
- Server Actions
- Tailwind CSS
- Zod
- Vitest

### 初回セットアップ

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

SupabaseのSQLエディタで、以下のマイグレーションを実行します。

```text
supabase/migrations/001_phase1_schema.sql
```

### 起動

```bash
npm run dev
```

### 確認

```bash
npm test
npm run build
```

## Phase 2-A Google Calendar 連携

Google Calendar の予定あり時間帯を候補日時作成画面に表示する設定手順は、`docs/phase2-google-calendar-setup.md` を参照してください。
