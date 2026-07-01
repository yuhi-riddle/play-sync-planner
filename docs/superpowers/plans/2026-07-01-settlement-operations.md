# Phase 3-B Settlement Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清算の編集・削除・一部支払いを追加し、支払い前なら間違いを直せる状態にする。

**Architecture:** `expenses` は立替支払い、`settlements` は請求、`settlement_payments` は参加者間の実支払いとして分ける。金額計算と残額計算は `lib/domain/settlement.ts`、入力検証は `lib/validators.ts`、DB更新は `lib/actions/settlements.ts` に置く。

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres, Server Actions, Zod, Vitest.

## Global Constraints

- 外部決済API連携は実装しない
- 支払い証拠画像アップロードは実装しない
- 清算支払いが始まった後の立替支払い再計算は実装しない
- `settlement_payments` が1件でもある場合、立替支払いの追加・編集・削除はブロックする

---

### Task 1: Payment Progress Domain

**Files:**
- Modify: `lib/domain/settlement.ts`
- Test: `tests/domain/settlement.test.ts`

**Interfaces:**
- Produces: `summarizeSettlementPaymentProgress(settlementAmount, payments)`

- [ ] Write failing tests for partial payment, full payment, confirmed payment, and overpayment guard
- [ ] Run `npm.cmd test -- tests/domain/settlement.test.ts` and confirm the new tests fail
- [ ] Implement `summarizeSettlementPaymentProgress`
- [ ] Re-run the test and confirm it passes

### Task 2: Payment Validation

**Files:**
- Modify: `lib/validators.ts`
- Test: `tests/validators.test.ts`

**Interfaces:**
- Produces: `settlementPaymentSchema`

- [ ] Write failing tests for positive payment amount and negative/zero rejection
- [ ] Run `npm.cmd test -- tests/validators.test.ts` and confirm the new tests fail
- [ ] Implement `settlementPaymentSchema`
- [ ] Re-run the test and confirm it passes

### Task 3: Database And Actions

**Files:**
- Create: `supabase/migrations/006_settlement_payments.sql`
- Modify: `lib/actions/settlements.ts`

**Interfaces:**
- Produces: `updateExpenseAction`, `deleteExpenseAction`, `recordSettlementPaymentAction`, `confirmSettlementPaymentAction`

- [ ] Add `settlement_payments` table and RLS policy
- [ ] Block expense add/edit/delete when settlement payments exist
- [ ] Add expense update and delete actions
- [ ] Add partial settlement payment action
- [ ] Add payment confirmation action

### Task 4: UI

**Files:**
- Modify: `components/expense-form.tsx`
- Modify: `app/plans/[planId]/settlement/page.tsx`

**Interfaces:**
- Produces: editable expense forms and partial payment forms on `/plans/:planId/settlement`

- [ ] Allow `ExpenseForm` to receive default values for edits
- [ ] Show edit/delete controls for expenses before settlement payments exist
- [ ] Show settlement paid amount, remaining amount, and payment history
- [ ] Replace full paid action with partial payment recording

### Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/design/01_requirements.md`
- Modify: `docs/design/02_database_design.md`
- Modify: `docs/design/03_screen_flow.md`

- [ ] Update docs with Phase 3-B behavior
- [ ] Write Obsidian project note update
- [ ] Run `npm.cmd test`
- [ ] Run `npm.cmd run build`
- [ ] Run `git diff --check`
