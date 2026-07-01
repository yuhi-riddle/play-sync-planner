# Phase 3-A Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参加予定ごとに支払い履歴を登録し、相殺後の清算結果を表示・更新できるようにする。

**Architecture:** 清算計算は `lib/domain/settlement.ts` の純粋関数に閉じ込める。DB更新は `lib/actions/settlements.ts` のServer Actionsで行い、画面は `/plans/[planId]/settlement` にまとめる。

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Postgres, Server Actions, Zod, Vitest.

## Global Constraints

- 外部決済APIとの直接連携は実装しない
- 支払い証拠画像アップロードは実装しない
- 自動リマインド送信は実装しない
- 支払い済みまたは受け取り確認済みの清算がある場合、費用追加はブロックする

---

### Task 1: Settlement Domain

**Files:**
- Create: `lib/domain/settlement.ts`
- Test: `tests/domain/settlement.test.ts`

**Interfaces:**
- Produces: `buildEqualExpenseSplits(amount, participantIds)`, `validateIndividualSplits(amount, splits)`, `calculateSettlementTransfers(input)`

- [x] Write failing tests for equal split, individual split validation, and transfer calculation
- [x] Run `npm.cmd test -- tests/domain/settlement.test.ts` and confirm the missing module failure
- [x] Implement the domain functions
- [x] Re-run the test and confirm it passes

### Task 2: Expense Validation

**Files:**
- Modify: `lib/validators.ts`
- Test: `tests/validators.test.ts`

**Interfaces:**
- Produces: `expenseSchema`, `ExpenseFormValues`

- [x] Write failing tests for equal split, individual split, negative amount, and mismatched individual totals
- [x] Run `npm.cmd test -- tests/validators.test.ts` and confirm `expenseSchema` is missing
- [x] Implement `expenseSchema`
- [x] Re-run the validator test and confirm it passes

### Task 3: Database And Actions

**Files:**
- Create: `supabase/migrations/005_settlement_core.sql`
- Create: `lib/actions/settlements.ts`

**Interfaces:**
- Produces: `createExpenseAction`, `markSettlementPaidAction`, `confirmSettlementReceivedAction`, `markSettlementReminderSentAction`

- [x] Add settlement tables and RLS policies
- [x] Add actions for expense creation, settlement recalculation, payment status, receipt confirmation, and reminder logs
- [x] Keep recalculation blocked once paid or confirmed settlements exist

### Task 4: Settlement UI

**Files:**
- Create: `components/expense-form.tsx`
- Create: `components/settlement-reminder-card.tsx`
- Create: `app/plans/[planId]/settlement/page.tsx`
- Modify: `app/plans/[planId]/page.tsx`
- Modify: `components/ui.tsx`
- Modify: `lib/format.ts`

**Interfaces:**
- Produces: `/plans/:planId/settlement`

- [x] Add expense form
- [x] Add settlement reminder card
- [x] Add settlement page
- [x] Add route link from plan detail
- [x] Add yen formatting and numeric input minimum support

### Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/design/01_requirements.md`
- Modify: `docs/design/02_database_design.md`
- Modify: `docs/design/03_screen_flow.md`

- [x] Update setup and Phase 3-A documentation
- [x] Run `npm.cmd test`
- [x] Run `npm.cmd run build`
