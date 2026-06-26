# Madoi

## 概要

Madoi は、友人同士の遊び予定について、日程調整・参加者管理・Googleカレンダー登録・リマインド・Walica風清算・支払い証拠管理までを一元管理するWebアプリです。

リポジトリ名と開発プロジェクト名は `play-sync-planner` のままです。

最初のMVPでは謎解き公演向けに作成します。  
ただし、将来的にはライブ、旅行、飲み会、スノボ、ボードゲーム会などにも拡張できる設計とします。

## コンセプト

TimeRex のような日程調整の便利さと、Walica のような割り勘清算の分かりやすさを、遊び予定向けに統合する。

## MVPの中心機能

- イベント / 公演登録
- 参加予定作成
- 候補日登録
- 日程回答
- 日程確定
- 共有リンク
- Googleカレンダー連携
- リマインド
- Walica風清算
- 支払い証拠管理

## ファイル構成

- `docs/design/01_requirements.md`：要件定義書 v1.0
- `docs/design/02_database_design.md`：DB設計 v1.0
- `docs/design/03_screen_flow.md`：画面一覧・画面遷移 v1.0
- `docs/design/04_codex_phase1_prompt.md`：Codex Phase 1 実装プロンプト
- `docs/phase1-user-setup.md`：Phase 1 セットアップ手順

## 開発方針

1. 要件定義を確定する
2. DB設計を確定する
3. 画面一覧・画面遷移を確定する
4. CodexにPhase 1実装を依頼する
5. Phase 2でWalica風清算を実装する
6. Phase 3でGoogleカレンダー・通知連携を拡張する

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
