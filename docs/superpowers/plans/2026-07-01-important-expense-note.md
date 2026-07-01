# Important Expense Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支払い履歴に、予約番号や当日必要な情報を目立たせるための重要メモ扱いを追加する。

**Architecture:** 画像アップロードやOCRは実装しない。`expenses.is_important` を追加し、既存の支払い履歴フォームと清算画面で重要メモとして表示する。

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres, Server Actions, Zod, Vitest.

## Global Constraints

- 支払い証拠画像アップロードは実装しない
- OCR、PDF解析、購入メール解析は実装しない
- 清算支払いと立替支払いの分離は維持する
- 重要メモは `expenses` の表示補助として扱う

---

### Task 1: Validation

**Files:**
- Modify: `lib/validators.ts`
- Test: `tests/validators.test.ts`

- [ ] `expenseSchema` が `is_important` を boolean として受け取る failing test を追加する
- [ ] `npm.cmd test -- tests/validators.test.ts` で失敗を確認する
- [ ] `expenseSchema` に `is_important` を追加する
- [ ] 同テストが通ることを確認する

### Task 2: Database And Actions

**Files:**
- Create: `supabase/migrations/007_expense_important_notes.sql`
- Modify: `lib/actions/settlements.ts`

- [ ] `expenses.is_important boolean not null default false` を追加する
- [ ] 支払い追加・編集で `is_important` を保存する
- [ ] 関連テストを通す

### Task 3: UI And Docs

**Files:**
- Modify: `components/expense-form.tsx`
- Modify: `app/plans/[planId]/settlement/page.tsx`
- Modify: `README.md`
- Modify: `docs/design/01_requirements.md`
- Modify: `docs/design/02_database_design.md`
- Modify: `docs/design/03_screen_flow.md`

- [ ] 支払いフォームに「重要メモとして表示」チェックを追加する
- [ ] 補足文に「予約番号・当日必要な情報など」を明記する
- [ ] 支払い履歴で重要メモを目立つ表示にする
- [ ] 証拠アップロード予定の文言を削り、重要メモ方針へ更新する
- [ ] `npm.cmd test`、`npm.cmd run build`、`git diff --check` を通す
