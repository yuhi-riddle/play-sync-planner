# 清算時の支払い方法を参加者単位でまとめる Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清算画面の支払い方法入力を「参加者1人につき1箇所」にまとめ、立替追加のたびに支払い方法を聞く仕様を廃止する。

**Architecture:** `participants` テーブルに `settlement_payment_method` カラムを追加する。清算計算上、1人の参加者は「受け取る側」か「払う側」のどちらか一方にしかならないため、この1カラムで両方を兼ねる。管理画面（ログイン必須、本人のみ編集可）と公開画面（ログイン不要、日程調整の回答フォームと同じ本人特定ロジックを流用）の両方に「あなたの支払い方法」という1つのフォームを新設し、既存の清算ペアごとの個別入力欄は削除する。

**Tech Stack:** Next.js App Router (Server Actions) / Supabase (Postgres) / Zod / Vitest + Testing Library

## Global Constraints

- 設計docは `docs/superpowers/specs/2026-08-02-settlement-payment-method-design.md`。矛盾があれば設計docを正とする
- 送金先URL・メモは今回もペアごとの個別入力のまま。まとめる対象は支払い方法のみ
- 清算計算ロジック（`lib/domain/settlement.ts` の `calculateSettlementTransfers`）は変更しない
- 支払い方法は依然として自由入力のテキスト（enum化しない）
- マイグレーション番号は `025`。`codex/performance-security-foundation` ブランチ（未マージ）も025以降を予定しているため、マージ時に番号調整が必要になる旨をマイグレーションファイルのコメントに残す
- 「あなたの支払い方法」は本人（ログインユーザー）のみが編集する。主催者による代理編集はしない
- 各タスクの最後で `npm test -- --run` を実行し、そのタスクで触れたテストファイルが全て通ることを確認してからコミットする

---

## Task 1: DBマイグレーション — participants.settlement_payment_method

**Files:**
- Create: `supabase/migrations/025_participant_settlement_payment_method.sql`

**Interfaces:**
- Produces: `participants.settlement_payment_method`（`text`, nullable）カラム。以降の全タスクがこのカラム名をそのまま使う

- [ ] **Step 1: マイグレーションファイルを作成する**

`supabase/migrations/025_participant_settlement_payment_method.sql` を新規作成する。

```sql
-- 清算の支払い方法を参加者単位で1箇所にまとめるためのカラム。
-- 清算計算上、1人の参加者は受け取る側(creditor)か払う側(debtor)の
-- どちらか一方にしかならないため、1カラムで受け取り方法・支払い方法の
-- 両方を兼ねる。詳細は docs/superpowers/specs/2026-08-02-settlement-payment-method-design.md を参照。
--
-- 注意: codex/performance-security-foundation ブランチ(未マージ)も025以降の
-- 番号を使う予定のため、マージ時にどちらかの番号を採番し直す調整が必要。

alter table public.participants
  add column if not exists settlement_payment_method text;

comment on column public.participants.settlement_payment_method is
  '清算での受け取り方法・支払い方法。参加者本人のみが設定する。';

-- 既存のsettlements.payment_methodを、受け取り側participantへバックフィルする。
-- 同一participantに複数の値がある場合は直近のpaid_at(無ければcreated_at)を優先する。
with ranked as (
  select
    to_participant_id,
    payment_method,
    row_number() over (
      partition by to_participant_id
      order by coalesce(paid_at, created_at) desc
    ) as rn
  from public.settlements
  where payment_method is not null
)
update public.participants
set settlement_payment_method = ranked.payment_method
from ranked
where participants.id = ranked.to_participant_id
  and ranked.rn = 1;
```

- [ ] **Step 2: 内容を自己レビューする**

以下を確認する。
- `add column if not exists` で再実行安全になっている
- バックフィルの `update ... from ranked` が `to_participant_id` 単位で最新1件だけを選んでいる（`rn = 1`）
- 既存の `001_phase1_schema.sql` の `participants` テーブル定義（`plan_id`, `user_id`, `display_name` など）と型が衝突しない

- [ ] **Step 3: コミットする**

```bash
git add supabase/migrations/025_participant_settlement_payment_method.sql
git commit -m "feat: add participants.settlement_payment_method column"
```

---

## Task 2: バリデータ層 — payment_method の入出力を整理する

**Files:**
- Modify: `lib/validators.ts:155-222`
- Test: `tests/validators.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `expenseSchema`（`payment_method` フィールドを持たない）、`settlementPaymentSchema`（同）、`settlementPaymentInstructionSchema`（同）、新規 `participantSettlementPaymentMethodSchema: z.ZodSchema<{ settlement_payment_method: string | null }>`。Task 5, 7, 8 がこれらを使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/validators.test.ts` の末尾（既存の `expenseSchema` テスト群のあと、`settlementPaymentSchema` のテスト群の前）に以下を追加する。

```ts
describe("participantSettlementPaymentMethodSchema", () => {
  it("accepts a payment method string", () => {
    const result = participantSettlementPaymentMethodSchema.parse({
      settlement_payment_method: "PayPay"
    });
    expect(result).toEqual({ settlement_payment_method: "PayPay" });
  });

  it("defaults to null when omitted", () => {
    const result = participantSettlementPaymentMethodSchema.parse({});
    expect(result).toEqual({ settlement_payment_method: null });
  });
});
```

ファイル冒頭の import に `participantSettlementPaymentMethodSchema` を追加する。

```ts
import {
  eventDraftSchema,
  eventSchema,
  expenseSchema,
  participantSettlementPaymentMethodSchema,
  planSchema,
  settlementPaymentInstructionSchema,
  settlementPaymentSchema
} from "@/lib/validators";
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/validators.test.ts`
Expected: FAIL（`participantSettlementPaymentMethodSchema` が存在せず import エラー）

- [ ] **Step 3: `lib/validators.ts` を変更する**

`expenseSchema`（155-166行目）から `payment_method` フィールドを削除する。

```ts
export const expenseSchema = z
  .object({
    title: z.string().trim().min(1, "支払い内容を入力してください"),
    payer_participant_id: z.string().trim().min(1, "支払った人を選択してください"),
    amount: positiveInteger("金額を入力してください", "金額は1円以上で入力してください"),
    split_mode: z.enum(["equal", "individual"], {
      required_error: "割り方を選択してください",
      invalid_type_error: "割り方を選択してください"
    }),
    split_participant_ids: optionalStringList().default([]),
    individual_participant_ids: optionalStringList().default([]),
    individual_split_amounts: optionalPositiveIntegerList().default([]),
    memo: nullableText.default(null),
    payment_url: nullableUrl.default(null),
    is_important: checkboxBoolean()
  })
```

`.superRefine(...)` 以降（167-196行目）は変更しない。

`settlementPaymentSchema`（211-216行目）から `payment_method` を削除する。

```ts
export const settlementPaymentSchema = z.object({
  amount: positiveInteger("支払い金額を入力してください", "支払い金額は1円以上で入力してください"),
  payment_url: nullableUrl.default(null),
  memo: nullableText.default(null)
});
```

`settlementPaymentInstructionSchema`（218-222行目）から `payment_method` を削除する。

```ts
export const settlementPaymentInstructionSchema = z.object({
  payment_url: nullableUrl.default(null),
  memo: nullableText.default(null)
});
```

この3つの直後に `participantSettlementPaymentMethodSchema` を新規追加する。

```ts
export const participantSettlementPaymentMethodSchema = z.object({
  settlement_payment_method: nullableText.default(null)
});
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- --run tests/validators.test.ts`
Expected: PASS

既存の `expenseSchema` テスト（"accepts equal split expenses" など）が `payment_method` を入力に含めていても、Zod の `z.object` は未知キーを無視するため壊れない。`settlementPaymentInstructionSchema` の既存テスト（`payment_method` を含めて `toEqual` しているもの）は、`payment_method` を含まない形に更新が必要な場合は個別に直す。

- [ ] **Step 5: コミットする**

```bash
git add lib/validators.ts tests/validators.test.ts
git commit -m "refactor: remove payment_method from per-record validators"
```

---

## Task 3: ドメイン層 — resolveParticipantSettlementRole

**Files:**
- Modify: `lib/domain/settlement.ts`
- Test: `tests/domain/settlement.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `resolveParticipantSettlementRole(participantId: string, settlements: { fromParticipantId: string; toParticipantId: string }[]): "receive" | "pay" | null`。Task 7, 8 がこれを使って「あなた」の役割を判定する

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/settlement.test.ts` の末尾に追加する。

```ts
describe("resolveParticipantSettlementRole", () => {
  const settlements = [
    { fromParticipantId: "bob", toParticipantId: "alice" },
    { fromParticipantId: "chika", toParticipantId: "alice" }
  ];

  it("returns receive when the participant is a creditor in any pair", () => {
    expect(resolveParticipantSettlementRole("alice", settlements)).toBe("receive");
  });

  it("returns pay when the participant is a debtor", () => {
    expect(resolveParticipantSettlementRole("bob", settlements)).toBe("pay");
  });

  it("returns null when the participant has no settlement pairs", () => {
    expect(resolveParticipantSettlementRole("dana", settlements)).toBeNull();
  });
});
```

ファイル冒頭の import に `resolveParticipantSettlementRole` を追加する。

```ts
import {
  buildEqualExpenseSplits,
  buildSettlementConfirmationRequestMessage,
  getSettlementStatusView,
  getPaymentInstructionView,
  buildSettlementPaymentRequestMessage,
  calculateSettlementTransfers,
  resolveParticipantSettlementRole,
  summarizeSettlementNextActions,
  summarizeSettlementOverview,
  summarizeSettlementPaymentProgress,
  validateIndividualSplits
} from "@/lib/domain/settlement";
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/domain/settlement.test.ts`
Expected: FAIL（`resolveParticipantSettlementRole` が存在しない）

- [ ] **Step 3: `lib/domain/settlement.ts` に関数を追加する**

`calculateSettlementTransfers` 関数（198-258行目）の直後に追加する。

```ts
export function resolveParticipantSettlementRole(
  participantId: string,
  settlements: Array<{ fromParticipantId: string; toParticipantId: string }>
): "receive" | "pay" | null {
  const isReceiver = settlements.some((settlement) => settlement.toParticipantId === participantId);
  if (isReceiver) {
    return "receive";
  }

  const isPayer = settlements.some((settlement) => settlement.fromParticipantId === participantId);
  return isPayer ? "pay" : null;
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- --run tests/domain/settlement.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add lib/domain/settlement.ts tests/domain/settlement.test.ts
git commit -m "feat: add resolveParticipantSettlementRole"
```

---

## Task 4: ドメイン層 — resolveViewerParticipant（公開画面の本人特定）

**Files:**
- Modify: `lib/domain/participant-identity.ts`
- Test: `tests/domain/participant-identity.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `resolveViewerParticipant({ participants: ParticipantIdentity[]; userId: string | null; selectedParticipantId: string | null }): ParticipantIdentity | null`。Task 8 が公開画面での本人特定に使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/participant-identity.test.ts` の末尾に追加する。

```ts
describe("resolveViewerParticipant", () => {
  const participants = [
    { id: "participant-1", displayName: "Alice", userId: "user-alice" },
    { id: "participant-2", displayName: "Bob", userId: null }
  ];

  it("matches by logged-in user id first", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: "user-alice",
        selectedParticipantId: "participant-2"
      })
    ).toEqual(participants[0]);
  });

  it("falls back to the selected participant id when not logged in", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: "participant-2"
      })
    ).toEqual(participants[1]);
  });

  it("returns null when neither user id nor selection resolves a participant", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: null
      })
    ).toBeNull();
  });

  it("returns null when the selected participant id does not exist", () => {
    expect(
      resolveViewerParticipant({
        participants,
        userId: null,
        selectedParticipantId: "unknown"
      })
    ).toBeNull();
  });
});
```

ファイル冒頭の import に `resolveViewerParticipant` を追加する。

```ts
import {
  canConfirmSettlementPayment,
  resolveAnswerParticipantForSubmission,
  resolveViewerParticipant
} from "@/lib/domain/participant-identity";
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/domain/participant-identity.test.ts`
Expected: FAIL（`resolveViewerParticipant` が存在しない）

- [ ] **Step 3: `lib/domain/participant-identity.ts` に関数を追加する**

ファイル末尾（`canConfirmSettlementPayment` の後）に追加する。

```ts
export function resolveViewerParticipant({
  participants,
  userId,
  selectedParticipantId
}: {
  participants: ParticipantIdentity[];
  userId: string | null;
  selectedParticipantId: string | null;
}): ParticipantIdentity | null {
  if (userId) {
    const byUser = participants.find((participant) => participant.userId === userId);
    if (byUser) {
      return byUser;
    }
  }

  if (selectedParticipantId) {
    return participants.find((participant) => participant.id === selectedParticipantId) ?? null;
  }

  return null;
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- --run tests/domain/participant-identity.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add lib/domain/participant-identity.ts tests/domain/participant-identity.test.ts
git commit -m "feat: add resolveViewerParticipant for the public settlement screen"
```

---

## Task 5: 立替フォームから支払い方法欄を削除する

**Files:**
- Modify: `components/expense-form.tsx:1-207`
- Modify: `lib/actions/settlements.ts:274-427`
- Create: `tests/expense-form.test.tsx`

**Interfaces:**
- Consumes: Task 2 で変更済みの `expenseSchema`（`payment_method` を持たない）
- Produces: `ExpenseForm` は `initialValues.paymentMethod` を受け取らなくなる。`createExpenseAction` / `updateExpenseAction` は `expenses.payment_method` へ書き込まなくなる（既存の `expenses.payment_method` カラム自体・過去データ・表示ロジックは変更しない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/expense-form.test.tsx` を新規作成する。

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "@/components/expense-form";

describe("ExpenseForm", () => {
  it("does not render a payment method field", () => {
    render(
      <ExpenseForm
        participants={[{ id: "p1", displayName: "田中" }]}
        action={vi.fn()}
      />
    );

    expect(screen.queryByText("支払い方法")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/expense-form.test.tsx`
Expected: FAIL（`screen.getByText("支払い方法")` が見つかる、つまり `queryByText` が要素を返してしまい `not.toBeInTheDocument()` が失敗する）

- [ ] **Step 3: `components/expense-form.tsx` を変更する**

ファイル冒頭（1-8行目）は以下の構成になっている。

```ts
"use client";

import { ReceiptText } from "lucide-react";
import React, { useActionState, useState } from "react";

import { PaymentMethodField } from "@/components/payment-method-field";
import { MadoiForm, MadoiSelect, SubmitButton, TextArea, TextField } from "@/components/ui";
import type { ActionState } from "@/lib/domain/action-state";
```

6行目の `import { PaymentMethodField } from "@/components/payment-method-field";` を削除する。`TextField` は7行目の `@/components/ui` から既にimportされているため、7行目以降は変更しない。

`ExpenseFormInitialValues` 型（17-28行目）から `paymentMethod` を削除する。

```ts
type ExpenseFormInitialValues = {
  title?: string | null;
  amount?: number | null;
  payerParticipantId?: string | null;
  memo?: string | null;
  paymentUrl?: string | null;
  isImportant?: boolean | null;
  splitMode?: "equal" | "individual";
  splitParticipantIds?: string[];
  individualAmounts?: Record<string, number>;
};
```

184-186行目を以下に変更する（`PaymentMethodField` 行を削除し、URL入力だけを残す）。

```tsx
<div className="grid gap-4 md:grid-cols-2">
  <TextField label="支払い用URL" name="payment_url" defaultValue={initialValues?.paymentUrl} placeholder="https://..." />
</div>
```

- [ ] **Step 4: `lib/actions/settlements.ts` を変更する**

`createExpenseAction` の insert（304-317行目）から `payment_method: values.payment_method,` の行を削除する。

```ts
const { data: expense, error: expenseError } = await supabase
  .from("expenses")
  .insert({
    plan_id: planId,
    payer_participant_id: values.payer_participant_id,
    title: values.title,
    amount: values.amount,
    memo: values.memo,
    payment_url: values.payment_url,
    is_important: values.is_important
  })
  .select("id")
  .single();
```

`updateExpenseAction` の update（388-399行目）から同様に `payment_method: values.payment_method,` の行を削除する。

```ts
const { error: updateError } = await supabase
  .from("expenses")
  .update({
    payer_participant_id: values.payer_participant_id,
    title: values.title,
    amount: values.amount,
    memo: values.memo,
    payment_url: values.payment_url,
    is_important: values.is_important
  })
  .eq("id", expenseId);
```

- [ ] **Step 5: `app/plans/[planId]/settlement/page.tsx` の呼び出し元を直す**

492-503行目付近、`ExpenseForm` に渡している `initialValues` から `paymentMethod: expense.payment_method,` の行を削除する。

```tsx
initialValues={{
  title: expense.title,
  amount: expense.amount,
  payerParticipantId: expense.payer_participant_id,
  memo: expense.memo,
  paymentUrl: expense.payment_url,
  isImportant: expense.is_important,
  splitMode: "individual",
  splitParticipantIds: expense.expense_splits.map((split) => split.participant_id),
  individualAmounts: Object.fromEntries(expense.expense_splits.map((split) => [split.participant_id, split.amount]))
}}
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `npm test -- --run tests/expense-form.test.tsx tests/settlement-page.test.tsx`
Expected: PASS

- [ ] **Step 7: コミットする**

```bash
git add components/expense-form.tsx lib/actions/settlements.ts app/plans/[planId]/settlement/page.tsx tests/expense-form.test.tsx
git commit -m "feat: remove the per-expense payment method input"
```

---

## Task 6: SettlementPaymentMethodForm コンポーネント新規作成

**Files:**
- Create: `components/settlement-payment-method-form.tsx`
- Test: `tests/settlement-payment-method-form.test.tsx`

**Interfaces:**
- Consumes: `components/payment-method-field.tsx` の `PaymentMethodField`
- Produces: `SettlementPaymentMethodForm({ role: "receive" | "pay"; currentValue: string | null; action: (formData: FormData) => void | Promise<void> })`。Task 7（管理画面）・Task 8（公開画面）の両方がこのコンポーネントを使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/settlement-payment-method-form.test.tsx` を新規作成する。

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettlementPaymentMethodForm } from "@/components/settlement-payment-method-form";

describe("SettlementPaymentMethodForm", () => {
  it("labels the field as a receiving method for the receive role", () => {
    render(<SettlementPaymentMethodForm role="receive" currentValue={null} action={vi.fn()} />);

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByText("受け取り方法を保存")).toBeInTheDocument();
  });

  it("labels the field as a paying method for the pay role", () => {
    render(<SettlementPaymentMethodForm role="pay" currentValue={null} action={vi.fn()} />);

    expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
    expect(screen.getByText("支払い方法を保存")).toBeInTheDocument();
  });

  it("prefills the field with the current value", () => {
    render(<SettlementPaymentMethodForm role="pay" currentValue="PayPay" action={vi.fn()} />);

    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/settlement-payment-method-form.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: `components/settlement-payment-method-form.tsx` を作成する**

```tsx
import React from "react";

import { PaymentMethodField } from "@/components/payment-method-field";
import { Card } from "@/components/ui";

export function SettlementPaymentMethodForm({
  role,
  currentValue,
  action
}: {
  role: "receive" | "pay";
  currentValue: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const label = role === "receive" ? "受け取り方法" : "支払い方法";

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">あなたの{label}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">ここで設定すると、あなたが関わる清算すべてに使われます。</p>
      <form action={action} className="mt-4 grid gap-3">
        <PaymentMethodField defaultValue={currentValue} />
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
        >
          {label}を保存
        </button>
      </form>
    </Card>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- --run tests/settlement-payment-method-form.test.tsx`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add components/settlement-payment-method-form.tsx tests/settlement-payment-method-form.test.tsx
git commit -m "feat: add the SettlementPaymentMethodForm component"
```

---

## Task 7: 主催者向け管理画面への統合

**Files:**
- Modify: `lib/actions/settlements.ts`
- Modify: `app/plans/[planId]/settlement/page.tsx`
- Test: `tests/settlement-page.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `resolveParticipantSettlementRole`、Task 6 の `SettlementPaymentMethodForm`、Task 2 の `participantSettlementPaymentMethodSchema` / `settlementPaymentInstructionSchema` / `settlementPaymentSchema`
- Produces: `updateParticipantSettlementPaymentMethodAction(participantId: string, formData: FormData): Promise<void>`（本人のみ）。管理画面に「あなたの受け取り方法／支払い方法」ブロックが表示される

- [ ] **Step 1: 失敗するテストを書く**

`tests/settlement-page.test.tsx` の `vi.mock("@/lib/actions/settlements", ...)`（18-26行目）に新規アクションを追加する。

```ts
vi.mock("@/lib/actions/settlements", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  recordSettlementPaymentAction: vi.fn(),
  confirmSettlementPaymentAction: vi.fn(),
  updateSettlementPaymentInstructionAction: vi.fn(),
  updateParticipantSettlementPaymentMethodAction: vi.fn(),
  markSettlementReminderSentAction: vi.fn()
}));
```

`participant` ヘルパー（30-32行目）に `settlementPaymentMethod` を追加できるよう拡張する。

```ts
function participant(id: string, name: string, userId: string, settlementPaymentMethod: string | null = null) {
  return { id, display_name: name, user_id: userId, settlement_payment_method: settlementPaymentMethod };
}
```

`describe("SettlementPage", ...)` 内に新しいテストを追加する。

```ts
it("shows the logged-in participant's own settlement payment method form when they are a creditor", async () => {
  const plan = basePlan([
    {
      id: "settlement-1",
      amount: 2000,
      status: "unpaid",
      payment_method: null,
      payment_url: null,
      memo: null,
      paid_at: null,
      confirmed_at: null,
      from_participant: participant("p2", "鈴木", "user-2"),
      to_participant: participant("p1", "田中", "user-1", "PayPay"),
      settlement_payments: []
    }
  ]);
  mockPlan(plan);

  render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

  expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
  expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
});

it("does not show the settlement payment method form when the viewer has no settlement pairs", async () => {
  const plan = basePlan([]);
  mockPlan(plan);

  render(await SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) }));

  expect(screen.queryByText("あなたの受け取り方法")).not.toBeInTheDocument();
  expect(screen.queryByText("あなたの支払い方法")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/settlement-page.test.tsx`
Expected: FAIL（`updateParticipantSettlementPaymentMethodAction` が存在しない、「あなたの受け取り方法」ブロックが未実装）

- [ ] **Step 3: `lib/actions/settlements.ts` に新規アクションを追加する**

ファイル冒頭の import に `participantSettlementPaymentMethodSchema` を追加する。

```ts
import {
  expenseSchema,
  participantSettlementPaymentMethodSchema,
  settlementPaymentInstructionSchema,
  settlementPaymentSchema,
  type ExpenseFormValues
} from "@/lib/validators";
```

`updateSettlementPaymentInstructionAction`（698-732行目）の直後に新規アクションを追加する。

```ts
export async function updateParticipantSettlementPaymentMethodAction(participantId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = participantSettlementPaymentMethodSchema.parse(formDataToObject(formData));

  const supabase = createSupabaseAdminClient();
  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, plan_id, user_id")
    .eq("id", participantId)
    .single();

  if (error || !participant || participant.user_id !== userId) {
    throw new Error("本人だけが支払い方法を設定できます");
  }

  const { error: updateError } = await supabase
    .from("participants")
    .update({ settlement_payment_method: values.settlement_payment_method })
    .eq("id", participantId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/plans/${participant.plan_id}`);
  revalidatePath(`/plans/${participant.plan_id}/settlement`);
}
```

`participants` テーブルの RLS は主催者のみが操作できる1ポリシーしかないため（`001_phase1_schema.sql`）、主催者以外の参加者本人がログインして更新する場合に `createSupabaseServerClient()`（RLS適用）を使うと弾かれる。そのため `createSupabaseAdminClient()`（RLSバイパス）を使い、`participant.user_id !== userId` のチェックをアプリケーションコード側で行う。

`updateSettlementPaymentInstructionAction`（698-732行目）から `payment_method` を除去する。

```ts
export async function updateSettlementPaymentInstructionAction(settlementId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = settlementPaymentInstructionSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが支払い先メモを編集できます");
  }

  const { error: updateError } = await supabase
    .from("settlements")
    .update({
      payment_url: values.payment_url,
      memo: values.memo
    })
    .eq("id", settlementId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}
```

`recordSettlementPaymentAction`（464-535行目）を、支払い方法をフォームから受け取らず、記録する participant（`settlement.from_participant_id`）の `settlement_payment_method` をコピーする形に変更する。

```ts
export async function recordSettlementPaymentAction(settlementId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  const supabase = await createSupabaseServerClient();
  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, amount, settlement_payments(amount, confirmed_at), plans(owner_user_id)")
    .eq("id", settlementId)
    .single();

  const plan = Array.isArray(settlement?.plans) ? settlement?.plans[0] : settlement?.plans;
  if (error || !settlement || plan?.owner_user_id !== userId) {
    throw new Error("主催者だけが支払い記録を追加できます");
  }

  const currentProgress = summarizeSettlementPaymentProgress(
    settlement.amount,
    ((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );

  if (values.amount > currentProgress.remainingAmount) {
    throw new Error("支払い金額が残額を超えています");
  }

  const { data: payer } = await supabase
    .from("participants")
    .select("settlement_payment_method")
    .eq("id", settlement.from_participant_id)
    .single();

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlementId,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: payer?.settlement_payment_method ?? null,
      payment_url: values.payment_url,
      memo: values.memo
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const nextProgress = summarizeSettlementPaymentProgress(settlement.amount, [
    ...((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    })),
    { amount: values.amount, confirmedAt: null }
  ]);

  await supabase
    .from("settlements")
    .update({
      status: nextProgress.status === "paid" || nextProgress.status === "confirmed" ? nextProgress.status : "unpaid",
      paid_at: nextProgress.paidAmount > 0 ? new Date().toISOString() : null
    })
    .eq("id", settlementId);

  await supabase.from("plans").update({ settlement_status: "settling" }).eq("id", settlement.plan_id);
  if (insertedPayment?.id) {
    await notifySettlementConfirmationDue({ settlementId, paymentId: insertedPayment.id });
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
}
```

- [ ] **Step 4: `app/plans/[planId]/settlement/page.tsx` を変更する**

冒頭の import に `SettlementPaymentMethodForm`、`resolveParticipantSettlementRole`、`updateParticipantSettlementPaymentMethodAction` を追加する。

```ts
import { SettlementPaymentMethodForm } from "@/components/settlement-payment-method-form";
```

```ts
import {
  confirmSettlementPaymentAction,
  createExpenseAction,
  deleteExpenseAction,
  markSettlementReminderSentAction,
  recordSettlementPaymentAction,
  updateParticipantSettlementPaymentMethodAction,
  updateSettlementPaymentInstructionAction,
  updateExpenseAction
} from "@/lib/actions/settlements";
```

```ts
import {
  buildSettlementConfirmationRequestMessage,
  buildSettlementPaymentRequestMessage,
  getPaymentInstructionView,
  resolveParticipantSettlementRole,
  summarizeSettlementNextActions,
  summarizeSettlementOverview,
  summarizeSettlementPaymentProgress,
  type SettlementNextActionItem,
  type SettlementPaymentProgress
} from "@/lib/domain/settlement";
```

`ParticipantRelation` 型（40-43行目）に `settlement_payment_method` を追加する。

```ts
type ParticipantRelation =
  | { id: string; display_name: string; user_id?: string | null; settlement_payment_method?: string | null }
  | { id: string; display_name: string; user_id?: string | null; settlement_payment_method?: string | null }[]
  | null;
```

`ParticipantRow` 型（45-50行目）に `settlement_payment_method` を追加する。

```ts
type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
  user_id: string | null;
  settlement_payment_method: string | null;
};
```

SELECT クエリ（142-148行目）の `participants(...)` と `settlements(...).to_participant:...(...)` に `settlement_payment_method` を追加する。

```ts
const { data: plan } = await supabase
  .from("plans")
  .select(
    "id, title, owner_user_id, events(id, title), share_links(token, purpose, status), participants(id, display_name, status, user_id, settlement_payment_method), expenses(id, title, amount, paid_at, memo, payment_method, payment_url, is_important, payer_participant_id, payer:participants!expenses_payer_participant_id_fkey(id, display_name, user_id), expense_splits(id, participant_id, amount, participants(id, display_name, user_id))), settlements(id, amount, status, payment_method, payment_url, memo, paid_at, confirmed_at, from_participant:participants!settlements_from_participant_id_fkey(id, display_name, user_id), to_participant:participants!settlements_to_participant_id_fkey(id, display_name, user_id, settlement_payment_method), settlement_payments(id, amount, payment_method, payment_url, memo, paid_at, confirmed_at, paid_by:participants!settlement_payments_paid_by_participant_id_fkey(id, display_name, user_id))), settlement_reminder_logs(sent_at, recipient_names, reminder_message, reminder_type)"
  )
  .eq("id", planId)
  .single();
```

`participants` の並び替え（161-163行目）の直後に、ログイン中の参加者本人とその役割を解決する処理を追加する。

```ts
const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
  a.display_name.localeCompare(b.display_name, "ja")
);
const myParticipant = participants.find((participant) => participant.user_id === userId) ?? null;
```

`settlements` の並び替え（165-171行目）の直後に役割判定を追加する。

```ts
const settlements = ((plan.settlements ?? []) as SettlementRow[]).sort((a, b) => {
  const statusOrder = { unpaid: 0, partially_paid: 1, paid: 2, confirmed: 3 };
  return (
    statusOrder[settlementProgress(a).status] - statusOrder[settlementProgress(b).status] ||
    participantName(a.from_participant).localeCompare(participantName(b.from_participant), "ja")
  );
});
const myRole = myParticipant
  ? resolveParticipantSettlementRole(
      myParticipant.id,
      settlements.map((settlement) => ({
        fromParticipantId: firstParticipant(settlement.from_participant)?.id ?? "",
        toParticipantId: firstParticipant(settlement.to_participant)?.id ?? ""
      }))
    )
  : null;
```

「清算結果」カード（398行目 `<Card><h2 className="text-lg font-semibold text-ink">清算結果</h2>`）の直前に、新ブロックを挿入する。

```tsx
{myParticipant && myRole ? (
  <SettlementPaymentMethodForm
    role={myRole}
    currentValue={myParticipant.settlement_payment_method}
    action={updateParticipantSettlementPaymentMethodAction.bind(null, myParticipant.id)}
  />
) : null}

<Card>
  <h2 className="text-lg font-semibold text-ink">清算結果</h2>
  ...
```

`SettlementActions` 内の `instructionView`（686行目）を、受け取り側 participant の `settlement_payment_method` を参照するように変更する。

```tsx
const instructionView = getPaymentInstructionView(
  firstParticipant(settlement.to_participant)?.settlement_payment_method ?? null,
  settlement.payment_url
);
```

`isPayPayMethod` の呼び出し（696行目）も同様に変更する。

```tsx
{progress.remainingAmount > 0 && isPayPayMethod(firstParticipant(settlement.to_participant)?.settlement_payment_method) ? (
```

「受け取り方法を設定」フォーム（707-717行目）から `PaymentMethodField` を削除する。

```tsx
<form action={updateSettlementPaymentInstructionAction.bind(null, settlement.id)} className="mt-3 grid gap-3">
  <label className="text-sm font-medium text-ink">
    <span className="text-muted">送金先URL</span>
    <input
      name="payment_url"
      defaultValue={settlement.payment_url ?? ""}
      className="mt-2 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
      placeholder="https://..."
    />
  </label>
```

（`summary` の直後から始まる `PaymentMethodField` の行だけを削除し、`送金先URL` 以降は変更しない。）

「支払った金額を記録」フォーム（759行目）から `PaymentMethodField` の行を削除する。

```tsx
<label className="text-sm font-medium text-ink">
  <span className="text-muted">支払い記録URL</span>
```

（`PaymentMethodField placeholder="例: PayPay" compact` の行を削除し、その前後は変更しない。）

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npm test -- --run tests/settlement-page.test.tsx tests/domain/settlement.test.ts tests/validators.test.ts`
Expected: PASS

- [ ] **Step 6: コミットする**

```bash
git add lib/actions/settlements.ts app/plans/[planId]/settlement/page.tsx tests/settlement-page.test.tsx
git commit -m "feat: consolidate settlement payment method on the organizer screen"
```

---

## Task 8: 参加者向け公開画面への統合

**Files:**
- Modify: `lib/actions/settlements.ts`
- Modify: `app/s/[token]/settlement/page.tsx`
- Modify: `components/public-settlement-summary.tsx`
- Test: `tests/public-settlement-summary.test.tsx`

**Interfaces:**
- Consumes: Task 4 の `resolveViewerParticipant`、Task 3 の `resolveParticipantSettlementRole`、Task 6 の `SettlementPaymentMethodForm`
- Produces: `updatePublicParticipantSettlementPaymentMethodAction(token: string, participantId: string, formData: FormData): Promise<void>`。`PublicSettlementItem` に `fromParticipantId` / `toParticipantId` が追加される。`PublicSettlementSummary` に `viewer` 関連の新しい props が追加される

- [ ] **Step 1: 失敗するテストを書く**

`tests/public-settlement-summary.test.tsx` に以下のテストを追加する（既存の `describe` ブロックの末尾、または新規 `describe` として追加）。

```tsx
describe("payment method viewer block", () => {
  const settlements = [
    {
      id: "settlement-1",
      fromParticipantId: "p2",
      toParticipantId: "p1",
      fromName: "鈴木",
      toName: "田中",
      amount: 2000,
      paymentMethod: null,
      paymentUrl: null,
      memo: null,
      payments: []
    }
  ];

  it("shows the settlement payment method form for the resolved viewer", () => {
    render(
      <PublicSettlementSummary
        eventTitle="夏祭り"
        planTitle={null}
        expenses={[]}
        settlements={settlements}
        viewer={{ role: "pay", currentValue: null, action: vi.fn() }}
      />
    );

    expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
  });

  it("shows a name picker when the viewer is not resolved yet", () => {
    render(
      <PublicSettlementSummary
        eventTitle="夏祭り"
        planTitle={null}
        expenses={[]}
        settlements={settlements}
        viewer={{ unresolvedParticipants: [{ id: "p1", displayName: "田中" }, { id: "p2", displayName: "鈴木" }] }}
      />
    );

    expect(screen.getByText("あなたのお名前")).toBeInTheDocument();
    expect(screen.getByText("田中")).toBeInTheDocument();
    expect(screen.getByText("鈴木")).toBeInTheDocument();
  });
});
```

ファイル冒頭の import に `vi` を追加する（まだ無ければ）。

```tsx
import { describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm test -- --run tests/public-settlement-summary.test.tsx`
Expected: FAIL（`viewer` prop が存在せず、「あなたの支払い方法」「あなたのお名前」が表示されない）

- [ ] **Step 3: `components/public-settlement-summary.tsx` を変更する**

冒頭の import に `SettlementPaymentMethodForm` を追加する。

```ts
import { SettlementPaymentMethodForm } from "@/components/settlement-payment-method-form";
```

`PublicSettlementItem` 型（20-29行目）に `fromParticipantId` / `toParticipantId` を追加する。

```ts
export type PublicSettlementItem = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  fromName: string;
  toName: string;
  amount: number;
  paymentMethod: string | null;
  paymentUrl: string | null;
  memo: string | null;
  payments: Array<{ amount: number; confirmedAt: string | null }>;
};
```

`PublicSettlementSummary` の props に `viewer` を追加する。

```ts
export function PublicSettlementSummary({
  eventTitle,
  planTitle,
  expenses,
  settlements,
  recordPaymentAction,
  viewer
}: {
  eventTitle: string;
  planTitle: string | null;
  expenses: PublicSettlementExpense[];
  settlements: PublicSettlementItem[];
  recordPaymentAction?: (settlementId: string, formData: FormData) => void | Promise<void>;
  viewer?:
    | { role: "receive" | "pay"; currentValue: string | null; action: (formData: FormData) => void | Promise<void> }
    | { unresolvedParticipants: Array<{ id: string; displayName: string }> };
}) {
```

「イベント」カード（62-79行目）の直後、「清算の進捗」カードの前に、`viewer` の内容に応じたブロックを挿入する。

```tsx
{viewer && "role" in viewer ? (
  <SettlementPaymentMethodForm role={viewer.role} currentValue={viewer.currentValue} action={viewer.action} />
) : null}

{viewer && "unresolvedParticipants" in viewer ? (
  <Card>
    <h2 className="text-lg font-semibold text-ink">あなたのお名前</h2>
    <p className="mt-1 text-sm leading-6 text-muted">選ぶと、あなたの支払い方法をまとめて設定できます。</p>
    <form method="get" className="mt-4 grid gap-3">
      <label className="text-sm font-medium text-ink">
        <span className="text-muted">あなたのお名前</span>
        <select
          name="viewer"
          defaultValue=""
          className="mt-2 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        >
          <option value="" disabled>
            選択してください
          </option>
          {viewer.unresolvedParticipants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:w-auto"
      >
        選択する
      </button>
    </form>
  </Card>
) : null}

<Card>
  <h2 className="text-lg font-semibold text-ink">清算の進捗</h2>
  ...
```

「支払いを記録」フォーム（146行目）から `PaymentMethodField` の行を削除する。

```tsx
<label className="text-sm font-medium text-ink">
  <span className="text-muted">支払い記録URL</span>
```

（`PaymentMethodField placeholder="例: PayPay" compact` の行を削除し、前後は変更しない。）

ファイル冒頭（1-9行目）は以下の構成になっている。

```tsx
import React from "react";

import { PaymentMethodField } from "@/components/payment-method-field";
import { isPayPayMethod, PayPayActionPanel } from "@/components/paypay-action-panel";
import { PaymentDestinationLink } from "@/components/payment-destination-link";
import { SettlementProgressSteps } from "@/components/settlement-progress-steps";
import { Badge, Card, EmptyState, MadoiForm, Stat, SubmitButton } from "@/components/ui";
import { getPaymentInstructionView, summarizeSettlementNextActions, summarizeSettlementOverview, summarizeSettlementPaymentProgress } from "@/lib/domain/settlement";
import { formatYenText } from "@/lib/format";
```

3行目の `import { PaymentMethodField } from "@/components/payment-method-field";` を削除する（このファイルの他の箇所ではもう使わないため）。`Card` は7行目の `@/components/ui` から既にimportされている。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npm test -- --run tests/public-settlement-summary.test.tsx`
Expected: PASS

- [ ] **Step 5: `lib/actions/settlements.ts` に公開画面用アクションを追加し、既存アクションを変更する**

`participantSettlementPaymentMethodSchema` は Task 7 の import 変更で既に読み込み済み。`recordPublicSettlementPaymentAction`（537-620行目）の直後に新規アクションを追加する。

```ts
export async function updatePublicParticipantSettlementPaymentMethodAction(
  token: string,
  participantId: string,
  formData: FormData
) {
  const values = participantSettlementPaymentMethodSchema.parse(formDataToObject(formData));
  const supabase = createSupabaseAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, status")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  if (link.status === "revoked") {
    throw new Error("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
  }

  const { data: participant, error } = await supabase
    .from("participants")
    .select("id, plan_id")
    .eq("id", participantId)
    .eq("plan_id", link.plan_id)
    .single();

  if (error || !participant) {
    throw new Error("参加者が見つかりません");
  }

  const { error: updateError } = await supabase
    .from("participants")
    .update({ settlement_payment_method: values.settlement_payment_method })
    .eq("id", participantId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(`/s/${token}/settlement`);
}
```

`recordPublicSettlementPaymentAction`（537-620行目）を、`settlement.from_participant_id` の `settlement_payment_method` をコピーする形に変更する。

```ts
export async function recordPublicSettlementPaymentAction(token: string, settlementId: string, formData: FormData) {
  const values = settlementPaymentSchema.parse(formDataToObject(formData));
  const supabase = createSupabaseAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("plan_id, status")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (linkError || !link) {
    throw new Error("共有リンクが見つかりません");
  }

  if (link.status === "revoked") {
    throw new Error("この共有リンクは無効化されています。主催者に新しいリンクを確認してください");
  }

  const { data: settlement, error } = await supabase
    .from("settlements")
    .select("id, plan_id, from_participant_id, amount, settlement_payments(amount, confirmed_at)")
    .eq("id", settlementId)
    .eq("plan_id", link.plan_id)
    .single();

  if (error || !settlement) {
    throw new Error("清算内容が見つかりません");
  }

  const currentProgress = summarizeSettlementPaymentProgress(
    settlement.amount,
    ((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    }))
  );

  if (values.amount > currentProgress.remainingAmount) {
    throw new Error("支払い金額が残額を超えています");
  }

  const { data: payer } = await supabase
    .from("participants")
    .select("settlement_payment_method")
    .eq("id", settlement.from_participant_id)
    .single();

  const { data: insertedPayment, error: insertError } = await supabase
    .from("settlement_payments")
    .insert({
      settlement_id: settlement.id,
      paid_by_participant_id: settlement.from_participant_id,
      amount: values.amount,
      payment_method: payer?.settlement_payment_method ?? null,
      payment_url: values.payment_url,
      memo: values.memo
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const nextProgress = summarizeSettlementPaymentProgress(settlement.amount, [
    ...((settlement.settlement_payments ?? []) as SettlementPaymentRow[]).map((payment) => ({
      amount: payment.amount,
      confirmedAt: payment.confirmed_at
    })),
    { amount: values.amount, confirmedAt: null }
  ]);

  await supabase
    .from("settlements")
    .update({
      status: nextProgress.status === "paid" || nextProgress.status === "confirmed" ? nextProgress.status : "unpaid",
      paid_at: nextProgress.paidAmount > 0 ? new Date().toISOString() : null
    })
    .eq("id", settlement.id);

  await supabase.from("plans").update({ settlement_status: "settling" }).eq("id", settlement.plan_id);
  if (insertedPayment?.id) {
    await notifySettlementConfirmationDue({ settlementId: settlement.id, paymentId: insertedPayment.id });
  }

  revalidatePath(`/plans/${settlement.plan_id}`);
  revalidatePath(`/plans/${settlement.plan_id}/settlement`);
  revalidatePath(`/s/${token}/settlement`);
  redirect(`/s/${token}/settlement?paid=1`);
}
```

- [ ] **Step 6: `app/s/[token]/settlement/page.tsx` 用の失敗するテストを書く**

`app/s/[token]/settlement/page.tsx` にはこれまで専用のテストファイルが無かった。`tests/settlement-page.test.tsx`（管理画面側）と同じ Supabase モックパターンで `tests/public-settlement-page.test.tsx` を新規作成する。

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabaseAdminEnv: vi.fn(() => true)
}));
vi.mock("@/lib/actions/settlements", () => ({
  recordPublicSettlementPaymentAction: vi.fn(),
  updatePublicParticipantSettlementPaymentMethodAction: vi.fn()
}));

import PublicSettlementPage from "@/app/s/[token]/settlement/page";

const basePlan = {
  id: "plan-1",
  title: "夏祭りの計画",
  confirmed_start_at: null,
  confirmed_end_at: null,
  is_all_day: false,
  events: [{ title: "夏祭り", location_name: null }],
  participants: [
    { id: "p1", display_name: "田中", user_id: "user-1", settlement_payment_method: "PayPay" },
    { id: "p2", display_name: "鈴木", user_id: "user-2", settlement_payment_method: null }
  ],
  expenses: [],
  settlements: [
    {
      id: "settlement-1",
      amount: 2000,
      payment_method: null,
      payment_url: null,
      memo: null,
      from_participant: { id: "p2", display_name: "鈴木", user_id: "user-2", settlement_payment_method: null },
      to_participant: { id: "p1", display_name: "田中", user_id: "user-1", settlement_payment_method: "PayPay" },
      settlement_payments: []
    }
  ]
};

function mockLink(plan: Record<string, unknown> | null) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { token: "tok-1", status: "open", plans: plan } })
    }))
  });
}

function mockCurrentUser(userId: string | null) {
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } })
    }
  });
}

describe("PublicSettlementPage", () => {
  it("shows the logged-in participant's own settlement payment method form", async () => {
    mockLink(basePlan);
    mockCurrentUser("user-1");

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("あなたの受け取り方法")).toBeInTheDocument();
    expect(screen.getByDisplayValue("PayPay")).toBeInTheDocument();
  });

  it("shows a name picker when nobody is logged in and no viewer is selected", async () => {
    mockLink(basePlan);
    mockCurrentUser(null);

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(screen.getByText("あなたのお名前")).toBeInTheDocument();
  });

  it("resolves the viewer from the viewer query parameter when not logged in", async () => {
    mockLink(basePlan);
    mockCurrentUser(null);

    render(
      await PublicSettlementPage({
        params: Promise.resolve({ token: "tok-1" }),
        searchParams: Promise.resolve({ viewer: "p2" })
      })
    );

    expect(screen.getByText("あなたの支払い方法")).toBeInTheDocument();
  });
});
```

Run: `npm test -- --run tests/public-settlement-page.test.tsx`
Expected: FAIL（`app/s/[token]/settlement/page.tsx` がまだ `createSupabaseServerClient` を呼んでおらず、「あなたの受け取り方法」等が表示されない）

- [ ] **Step 7: `app/s/[token]/settlement/page.tsx` を変更する**

冒頭の import を変更する。

```ts
import {
  recordPublicSettlementPaymentAction,
  updatePublicParticipantSettlementPaymentMethodAction
} from "@/lib/actions/settlements";
import { resolveParticipantSettlementRole } from "@/lib/domain/settlement";
import { resolveViewerParticipant } from "@/lib/domain/participant-identity";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";
```

`ParticipantRelation` 型（19行目）を、`id` / `user_id` / `settlement_payment_method` を持つ形に拡張する。

```ts
type ParticipantRelation =
  | { id: string; display_name: string; user_id: string | null; settlement_payment_method: string | null }
  | { id: string; display_name: string; user_id: string | null; settlement_payment_method: string | null }[]
  | null;
```

`PublicPlanRow` 型（41-50行目）に `participants` を追加する。

```ts
type PublicParticipantRow = {
  id: string;
  display_name: string;
  user_id: string | null;
  settlement_payment_method: string | null;
};

type PublicPlanRow = {
  id: string;
  title: string | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  is_all_day: boolean;
  events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
  participants?: PublicParticipantRow[];
  expenses?: PublicExpenseRow[];
  settlements?: PublicSettlementRow[];
};
```

`PublicSettlementRow` 型（30-39行目）の `from_participant` / `to_participant` は既に `ParticipantRelation` 型（今回拡張済み）を使っているのでそのまま。

関数シグネチャの `searchParams` に `viewer` を追加する。

```ts
export default async function PublicSettlementPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ paid?: string; viewer?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
```

SELECT クエリ（79-86行目）に `participants` と、`from_participant` / `to_participant` の追加フィールドを含める。

```ts
const supabase = createSupabaseAdminClient();
const { data: link } = await supabase
  .from("share_links")
  .select(
    "token, status, plans(id, title, confirmed_start_at, confirmed_end_at, is_all_day, events(title, location_name), participants(id, display_name, user_id, settlement_payment_method), expenses(id, title, amount, memo, is_important, payer:participants!expenses_payer_participant_id_fkey(display_name)), settlements(id, amount, payment_method, payment_url, memo, from_participant:participants!settlements_from_participant_id_fkey(id, display_name, user_id, settlement_payment_method), to_participant:participants!settlements_to_participant_id_fkey(id, display_name, user_id, settlement_payment_method), settlement_payments(amount, confirmed_at)))"
  )
  .eq("token", token)
  .eq("purpose", "answer")
  .single();
```

既存の108行目 `const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;` はそのまま残す。その後の `calendarShareUrl` の計算（109-117行目）、`expenses` の変換（118-125行目）も変更しない。`settlements` を組み立てる直前（126行目の手前）に、ログイン中ユーザーの取得と本人特定の処理を追加する。

```ts
const serverSupabase = await createSupabaseServerClient();
const {
  data: { user }
} = await serverSupabase.auth.getUser();
const currentUserId = user?.id ?? null;

const participants = (plan.participants ?? []) as PublicParticipantRow[];
const viewerParticipant = resolveViewerParticipant({
  participants: participants.map((participant) => ({
    id: participant.id,
    displayName: participant.display_name,
    userId: participant.user_id
  })),
  userId: currentUserId,
  selectedParticipantId: query.viewer ?? null
});
```

`settlements` の変換（126-138行目）に `fromParticipantId` / `toParticipantId` を追加する。

```ts
const settlements = ((plan.settlements ?? []) as PublicSettlementRow[]).map<PublicSettlementItem>((settlement) => ({
  id: settlement.id,
  fromParticipantId: firstParticipant(settlement.from_participant)?.id ?? "",
  toParticipantId: firstParticipant(settlement.to_participant)?.id ?? "",
  fromName: participantName(settlement.from_participant),
  toName: participantName(settlement.to_participant),
  amount: settlement.amount,
  paymentMethod: settlement.payment_method,
  paymentUrl: settlement.payment_url,
  memo: settlement.memo,
  payments: (settlement.settlement_payments ?? []).map((payment) => ({
    amount: payment.amount,
    confirmedAt: payment.confirmed_at
  }))
}));
```

`viewer` の役割と現在値を解決し、`PublicSettlementSummary` に渡す `viewer` prop を組み立てる。`settlements` の直後に追加する。

```ts
const viewerRole = viewerParticipant
  ? resolveParticipantSettlementRole(
      viewerParticipant.id,
      settlements.map((settlement) => ({
        fromParticipantId: settlement.fromParticipantId,
        toParticipantId: settlement.toParticipantId
      }))
    )
  : null;

const viewerProp =
  viewerParticipant && viewerRole
    ? {
        role: viewerRole,
        currentValue:
          participants.find((participant) => participant.id === viewerParticipant.id)?.settlement_payment_method ?? null,
        action: updatePublicParticipantSettlementPaymentMethodAction.bind(null, token, viewerParticipant.id)
      }
    : !viewerParticipant && participants.length > 0
      ? {
          unresolvedParticipants: participants.map((participant) => ({
            id: participant.id,
            displayName: participant.display_name
          }))
        }
      : undefined;
```

`PublicSettlementSummary` の呼び出し（165-171行目）に `viewer` を渡す。

```tsx
<PublicSettlementSummary
  eventTitle={event?.title ?? "イベント"}
  planTitle={plan.title}
  expenses={expenses}
  settlements={settlements}
  recordPaymentAction={recordPublicSettlementPaymentAction.bind(null, token)}
  viewer={viewerProp}
/>
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npm test -- --run tests/public-settlement-summary.test.tsx tests/public-settlement-page.test.tsx tests/domain/participant-identity.test.ts tests/domain/settlement.test.ts`
Expected: PASS

- [ ] **Step 9: プロジェクト全体のテスト・型チェック・lintを実行する**

Run: `npm test -- --run`
Expected: 全テストPASS

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npm run lint`
Expected: エラーなし

- [ ] **Step 10: コミットする**

```bash
git add lib/actions/settlements.ts app/s/[token]/settlement/page.tsx components/public-settlement-summary.tsx tests/public-settlement-summary.test.tsx tests/public-settlement-page.test.tsx
git commit -m "feat: consolidate settlement payment method on the public screen"
```

---

## Self-Review Notes

- **Spec coverage**: 設計docの「データモデル」「UI」「Server Actions」「テスト」「今回やらないこと」の各項目は Task 1〜8 でそれぞれ対応済み。送金先URL・メモの個別入力維持、清算計算ロジック不変、enum化しない、という「対象外」項目はどのタスクでも触れていない
- **既存データの表示**: `expenses.payment_method` / `settlements.payment_method` の過去データ・表示ロジック（立替の支払い履歴、支払い記録の履歴表示）はどのタスクでも変更していない。新規の書き込みだけが止まる
- **RLSの制約**: `participants` テーブルのRLSは主催者のみの1ポリシーのため、Task 7・8 の新規アクションはいずれも `createSupabaseAdminClient()` を使い、アプリケーションコード側で本人確認を行う設計にした（新しいRLSポリシーは追加しない）
