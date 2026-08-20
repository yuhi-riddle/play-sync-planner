# 清算画面リデザイン（第2弾） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清算画面の進捗表示を第1弾（plan-form）と同じ横型ドットプログレスに揃え、`design/rules.md` 違反の半透明面を解消し、重複していた生 `<button>` を共通 `Button`/`SubmitButton` に統一する。

**Architecture:** `components/settlement/settlement-progress-steps.tsx` を全面書き換えし、`components/plan/plan-form.tsx` のSTEP表示と同じDOM構造（丸番号ドット＋接続線＋現在ステップのみ本文表示、他は`sr-only`）にする。このコンポーネントはオーナー向け清算画面（`app/plans/[planId]/settlement/page.tsx`）と共有リンクの参加者向け公開ページ（`app/s/[token]/settlement` → `PublicSettlementSummary`）の両方から同じpropsで呼ばれる共通コンポーネントなので、公開ページ側のコード変更なしに両方へ反映される。半透明面の解消とボタン統一は既存の`components/ui/server.tsx`/`client.tsx`（第1弾で新設済み）を拡張するだけで、新しい色・トークンは足さない。

**Tech Stack:** Next.js App Router / TypeScript / Tailwind CSS / Vitest + Testing Library

## Global Constraints

- 設計docは `docs/superpowers/specs/2026-08-14-settlement-redesign-design.md`。矛盾があれば設計docを正とする
- `design/tokens.css` / `tailwind.config.ts` は変更しない。新しい色は `danger` variant含め既存の `clay` / `clay-ink` トークンのみを使う
- `app/s/[token]/settlement/page.tsx` / `components/settlement/public-settlement-summary.tsx` 自体のコードは変更しない（共有コンポーネント経由で自動反映されるため）
- `settlement/page.tsx` の「送金先を保存」ボタンは今回のスコープ外（次回以降）
- 各タスクの最後で、そのタスクが触れたテストファイルを `npx vitest run <path>` で実行し、通ることを確認してからコミットする
- 対象worktree: `D:\System\projects\play-sync-planner\.claude\worktrees\redesign+mobile-plan-flow`（ブランチ `worktree-redesign+mobile-plan-flow`、PR #13向け）

---

## Task 1: `Button`/`SubmitButton` に `variant="danger"` を追加

**Files:**
- Modify: `components/ui/server.tsx:95-102`
- Test: `tests/ui/ui-submit-button.test.tsx`

**Interfaces:**
- Produces: `ButtonVariant = "primary" | "secondary" | "danger"`。`buttonVariantClasses.danger` を `Button`/`SubmitButton` の両方から使える。以降のタスクはこの `variant="danger"` をそのまま使う

- [ ] **Step 1: 失敗するテストを書く**

`tests/ui/ui-submit-button.test.tsx` の最後のテスト（78-84行目、`it("refを転送できる...")`）の直前に追加する。

```tsx
  it("dangerバリアントは警告色のボタンクラスになる", () => {
    render(<SubmitButton variant="danger">削除する</SubmitButton>);

    const className = screen.getByRole("button").className;
    expect(className).toContain("text-clay-ink");
    expect(className).toContain("hover:bg-clay");
  });

```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/ui/ui-submit-button.test.tsx`
Expected: FAIL（`ButtonVariant` に `"danger"` が無く型エラー、または `buttonVariantClasses.danger` が `undefined` でクラスに含まれない）

- [ ] **Step 3: `buttonVariantClasses` に `danger` を追加する**

`components/ui/server.tsx:95-102` を以下に置き換える。

```tsx
export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "default" | "sm";

/** ButtonLink/SecondaryLink/Button/SubmitButton で共有する見た目の実体。 */
export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white shadow-soft hover:bg-pine",
  secondary: "border border-line-strong bg-surface text-ink hover:border-moss hover:text-pine",
  danger: "border border-clay/45 bg-surface text-clay-ink hover:bg-clay hover:text-white"
};
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run tests/ui/ui-submit-button.test.tsx`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add components/ui/server.tsx tests/ui/ui-submit-button.test.tsx
git commit -m "feat: add danger variant to shared Button/SubmitButton"
```

---

## Task 2: `SettlementProgressSteps` を横型ドットプログレスに書き換え

**Files:**
- Modify: `components/settlement/settlement-progress-steps.tsx`（全面書き換え）
- Test: `tests/settlement/settlement-progress-steps.test.tsx`

**Interfaces:**
- Consumes: なし（既存のprops `paymentWaitingCount: number`, `confirmationWaitingCount: number`, `isComplete: boolean` は変更しない）
- Produces: `SettlementProgressSteps` の見た目のみ変更。呼び出し側（`app/plans/[planId]/settlement/page.tsx`, `components/settlement/public-settlement-summary.tsx`）は無修正で動く

- [ ] **Step 1: 失敗するテストを書く**

`tests/settlement/settlement-progress-steps.test.tsx` を以下に置き換える。

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettlementProgressSteps } from "@/components/settlement/settlement-progress-steps";

describe("SettlementProgressSteps", () => {
  it("shows the current settlement step while payments are waiting", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={2}
        confirmationWaitingCount={0}
        isComplete={false}
      />
    );

    expect(screen.getByRole("list", { name: "清算の進捗" })).toBeInTheDocument();
    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByText("支払い待ち")).toBeInTheDocument();
    expect(screen.getByText("（2件）")).toBeInTheDocument();
    expect(screen.getByText("参加者の支払いを待っています。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("shows the confirmation step once payments are done", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={0}
        confirmationWaitingCount={2}
        isComplete={false}
      />
    );

    expect(screen.getByText("STEP 2")).toBeInTheDocument();
    expect(screen.getByText("受け取り確認待ち")).toBeInTheDocument();
    expect(screen.getByText("主催者の受け取り確認待ちです。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("marks the flow complete when nothing remains", () => {
    render(
      <SettlementProgressSteps
        paymentWaitingCount={0}
        confirmationWaitingCount={0}
        isComplete
      />
    );

    expect(screen.getByText("STEP 3")).toBeInTheDocument();
    expect(screen.getByText("（3/3）")).toBeInTheDocument();
    expect(screen.getByText("すべての支払い確認が終わっています。")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveAttribute("aria-current", "step");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/settlement/settlement-progress-steps.test.tsx`
Expected: FAIL（`screen.getByText("STEP 1")` 等が見つからない。現行コードは3枚カードグリッドのまま）

- [ ] **Step 3: コンポーネントを書き換える**

`components/settlement/settlement-progress-steps.tsx` を以下で全置き換えする。

```tsx
import React from "react";
import { clsx } from "clsx";

type StepTone = "current" | "done" | "waiting";

type Step = {
  label: string;
  countLabel: string;
  detail: string;
  tone: StepTone;
};

export function SettlementProgressSteps({
  paymentWaitingCount,
  confirmationWaitingCount,
  isComplete
}: {
  paymentWaitingCount: number;
  confirmationWaitingCount: number;
  isComplete: boolean;
}) {
  const currentStep = isComplete ? "complete" : confirmationWaitingCount > 0 ? "confirmation" : "payment";
  const steps: Step[] = [
    {
      label: "支払い待ち",
      countLabel: `${paymentWaitingCount}件`,
      detail: paymentWaitingCount > 0 ? "参加者の支払いを待っています。" : "支払い待ちはありません。",
      tone: currentStep === "payment" ? "current" : "done"
    },
    {
      label: "受け取り確認待ち",
      countLabel: `${confirmationWaitingCount}件`,
      detail: confirmationWaitingCount > 0 ? "主催者の受け取り確認待ちです。" : "確認待ちはありません。",
      tone: currentStep === "confirmation" ? "current" : currentStep === "complete" ? "done" : "waiting"
    },
    {
      label: "完了",
      countLabel: isComplete ? "3/3" : "未完了",
      detail: isComplete ? "すべての支払い確認が終わっています。" : "全員の支払い確認が終わると完了します。",
      tone: currentStep === "complete" ? "current" : "waiting"
    }
  ];

  const activeIndex = steps.findIndex((step) => step.tone === "current");
  const activeStep = activeIndex >= 0 ? steps[activeIndex] : null;

  return (
    <div className="grid gap-3">
      <ol aria-label="清算の進捗" className="flex items-center">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={step.tone === "current" ? "step" : undefined}
            className="flex flex-1 items-center last:flex-none"
          >
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors",
                step.tone === "current"
                  ? "bg-ink text-white"
                  : step.tone === "done"
                    ? "bg-mist text-pine"
                    : "border border-line text-muted"
              )}
            >
              <span aria-hidden="true">{index + 1}</span>
              <span className="sr-only">
                {step.label}（{step.countLabel}）
                {step.tone === "current" ? `・現在のステップ：${step.detail}` : step.tone === "done" ? "・完了" : ""}
              </span>
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={clsx("mx-2 h-px flex-1", step.tone === "done" ? "bg-moss/40" : "bg-line")}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {activeStep ? (
        <div>
          <p className="text-sm font-bold text-ink">
            <span className="tabular-nums text-muted">STEP {activeIndex + 1}</span>
            <span className="ml-2">{activeStep.label}</span>
            <span className="ml-2 text-muted">（{activeStep.countLabel}）</span>
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{activeStep.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
```

これで旧`StepIcon`・`toneClassNames`・`lucide-react`の`CheckCircle2`/`Circle`/`Clock3`importは全て削除される（新コードで使っていないため）。

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run tests/settlement/settlement-progress-steps.test.tsx`
Expected: PASS（3テストとも）

- [ ] **Step 5: コミット**

```bash
git add components/settlement/settlement-progress-steps.tsx tests/settlement/settlement-progress-steps.test.tsx
git commit -m "feat: switch settlement progress steps to horizontal dot progress"
```

---

## Task 3: 半透明面の解消（`settlement/page.tsx`, `notifications/page.tsx`）

**Files:**
- Modify: `app/plans/[planId]/settlement/page.tsx`（`bg-mist/45` が4箇所）
- Modify: `app/notifications/page.tsx:136`（`bg-mist/55` が1箇所）
- Test: `tests/settlement/settlement-page.test.tsx`, `tests/notification/notifications-page.test.tsx`（既存テストの回帰確認のみ、新規アサーションは無し）

**Interfaces:**
- Consumes: なし
- Produces: なし（クラス名のみの変更、propsやDOM構造は変えない）

半透明の`/45`・`/55`は`design/rules.md`の「面は3段、必ず不透明」に反する。見た目のトーンは変えず不透明化するだけなので、新規テストではなく既存テストの回帰確認で十分（挙動・テキスト・roleは変わらない）。

- [ ] **Step 1: `settlement/page.tsx` の `bg-mist/45` を全て `bg-mist` に置き換える**

`app/plans/[planId]/settlement/page.tsx` 内の4箇所（清算完了バッジ、経費の割り勘参加者チップ、依頼送信ログのラベル、送金先カードの完了バッジ）はいずれも `bg-mist/45` という同一の文字列なので、ファイル内の `bg-mist/45` を全て `bg-mist` に置換する。

```
- bg-mist/45
+ bg-mist
```

（置換前に `grep -n "bg-mist/45" "app/plans/[planId]/settlement/page.tsx"` で4箇所であることを確認してから置換する）

- [ ] **Step 2: `notifications/page.tsx` の `bg-mist/55` を `bg-mist` に置き換える**

`app/notifications/page.tsx:136` を編集する。

```tsx
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist/55 text-pine">
```

を

```tsx
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist text-pine">
```

に置き換える。

- [ ] **Step 3: 対象箇所が残っていないことを確認する**

Run: `grep -rn "bg-mist/45\|bg-mist/55" "app/plans/[planId]/settlement/page.tsx" app/notifications/page.tsx`
Expected: 出力なし（0件）

- [ ] **Step 4: 既存テストを実行して回帰がないことを確認する**

Run: `npx vitest run tests/settlement/settlement-page.test.tsx tests/notification/notifications-page.test.tsx`
Expected: PASS（全テスト、既存のまま）

- [ ] **Step 5: コミット**

```bash
git add "app/plans/[planId]/settlement/page.tsx" app/notifications/page.tsx
git commit -m "fix: remove translucent bg-mist fills in settlement and notifications pages"
```

---

## Task 4: `notifications/page.tsx` の「既読にする」ボタンを共通化

**Files:**
- Modify: `app/notifications/page.tsx:151-160`
- Test: `tests/notification/notifications-page.test.tsx`

**Interfaces:**
- Consumes: `SubmitButton`（`@/components/ui`、Task 1で `variant="danger"` が増えたのみで既存の `secondary` は変更なし）
- Produces: なし

`SubmitButton` は既にこのファイルの7行目でimport済み。

- [ ] **Step 1: 生`<button>`を`SubmitButton`に置き換える**

`app/notifications/page.tsx:151-160` を以下に置き換える。

```tsx
                  {!notification.read_at ? (
                    <form action={markNotificationReadAction.bind(null, notification.id)}>
                      <SubmitButton variant="secondary">既読にする</SubmitButton>
                    </form>
                  ) : null}
```

- [ ] **Step 2: 既存テストを実行して通ることを確認する**

Run: `npx vitest run tests/notification/notifications-page.test.tsx`
Expected: PASS（テキスト・role・disabled挙動は変わらないため既存アサーションのまま通る）

- [ ] **Step 3: コミット**

```bash
git add app/notifications/page.tsx
git commit -m "refactor: use shared SubmitButton for notification mark-as-read"
```

---

## Task 5: `settlement-confirmation-queue.tsx` の「受け取り確認する」ボタンを共通化

**Files:**
- Modify: `components/settlement/settlement-confirmation-queue.tsx`
- Test: `tests/settlement/settlement-confirmation-queue.test.tsx`

**Interfaces:**
- Consumes: `SubmitButton`（`@/components/ui`）
- Produces: なし

- [ ] **Step 1: `SubmitButton` をimportする**

`components/settlement/settlement-confirmation-queue.tsx:4` を以下に置き換える。

```tsx
import { Card, EmptyState, SubmitButton } from "@/components/ui";
```

- [ ] **Step 2: 生`<button>`を`SubmitButton`に置き換える**

`components/settlement/settlement-confirmation-queue.tsx:46-53` を以下に置き換える。

```tsx
                <form action={confirmPaymentAction.bind(null, item.id)}>
                  <SubmitButton className="w-full lg:w-auto">受け取り確認する</SubmitButton>
                </form>
```

- [ ] **Step 3: 既存テストを実行して通ることを確認する**

Run: `npx vitest run tests/settlement/settlement-confirmation-queue.test.tsx`
Expected: PASS（`getByRole("button", { name: "受け取り確認する" })` は`SubmitButton`が描く実`<button>`にそのままマッチする）

- [ ] **Step 4: コミット**

```bash
git add components/settlement/settlement-confirmation-queue.tsx
git commit -m "refactor: use shared SubmitButton for settlement confirmation"
```

---

## Task 6: `settlement/page.tsx` の「この支払いを削除」ボタンを `variant="danger"` に置き換え

**Files:**
- Modify: `app/plans/[planId]/settlement/page.tsx:546-553`
- Test: `tests/settlement/settlement-page.test.tsx`

**Interfaces:**
- Consumes: `SubmitButton`（既にこのファイルでimport済み）、Task 1で追加した `variant="danger"`
- Produces: なし

- [ ] **Step 1: 生`<button>`を`SubmitButton variant="danger"`に置き換える**

`app/plans/[planId]/settlement/page.tsx:546-553` を以下に置き換える。

```tsx
                    <form action={deleteExpenseAction.bind(null, expense.id)}>
                      <SubmitButton variant="danger" className="w-full sm:w-auto">
                        この支払いを削除
                      </SubmitButton>
                    </form>
```

- [ ] **Step 2: 既存テストを実行して通ることを確認する**

Run: `npx vitest run tests/settlement/settlement-page.test.tsx`
Expected: PASS（`deleteExpenseAction`はモック済みで、ボタンのテキスト・role検証は既存テストに無いため無修正で通る）

- [ ] **Step 3: コミット**

```bash
git add "app/plans/[planId]/settlement/page.tsx"
git commit -m "refactor: use danger-variant SubmitButton for expense deletion"
```

---

## Task 7: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 2: 全テスト**

Run: `npm test`
Expected: 全件PASS（Task 1〜6で触れたファイル＋既存の回帰なし）

- [ ] **Step 3: ビルド**

Run: `npm run build`
Expected: ビルド成功

- [ ] **Step 4: 実機確認**

`npm run dev` で以下を確認する。

- オーナー向け清算画面（`/plans/[planId]/settlement`）で、進捗表示が横型ドット（現在/完了/未来の3状態）で表示されること
- 共有リンクの参加者向け公開ページ（`/s/[token]/settlement`）でも同じドット表示になること（コード変更なしで反映されているか）
- 「既読にする」「受け取り確認する」の見た目・disabled/pending挙動が変更前と一致していること
- 「この支払いを削除」ボタンが警告色（clay系の枠線・文字、hoverで塗りつぶし）で表示されること
- 半透明修正後もカード面と背景の区別が明瞭であること

- [ ] **Step 5: PRへの反映**

```bash
git push
```

既存のPR #13（`worktree-redesign+mobile-plan-flow` → `main`）にこのタスクのコミットが積み上がる。
