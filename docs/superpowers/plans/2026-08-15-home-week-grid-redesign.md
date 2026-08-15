# ホーム週表示グリッド リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの週表示グリッド（`components/home/home-selected-date-agenda.tsx`）の窮屈な余白・曜日色分けロジックの重複・フォーカスリング実装漏れを解消する。

**Architecture:** 対象ファイルは `components/home/home-selected-date-agenda.tsx` 1本のみ。構造（7列グリッド・前後週ナビ・今日/明日/週末ショートカット）は変えず、間隔・型スケール・色分けロジック・フォーカスリング・ボタン実装だけを既存の共通部品/共有関数に寄せる。

**Tech Stack:** Next.js (App Router) / React / TypeScript / Tailwind CSS / clsx / Vitest + Testing Library

## Global Constraints

- 対象ファイルは `components/home/home-selected-date-agenda.tsx` とそのテスト `tests/home/home-selected-date-agenda.test.tsx` のみ。
- 週表示グリッドの構造（7列・前後週ナビ・今日/明日/週末ショートカットという仕組み）は変更しない。
- `design/tokens.css` / `tailwind.config.ts` は変更しない（既存トークン・型スケールの範囲内で実装）。
- フォーカスリングは `design/rules.md` に定める `focus:ring-2 focus:ring-clay focus:ring-offset-2` に揃える。
- 曜日の色分けは `lib/shared/calendar-styles.ts` の既存関数 `weekdayClass(index: number)` を再利用する（このファイル自体は変更しない。日曜=`text-clay-ink`・土曜=`text-sky-700`・平日=`text-muted`）。
- 型スケールは `text-caption` 等プロジェクト既定のスケールを使う。`text-[0.7rem]` のような型スケール外の任意値は使わない。
- `DateShortcut` の非アクティブ時の文字色が `text-muted`→`text-ink` に変わるのは意図した変更（共通`Button`の`secondary`に揃えるため、第2弾Task4と同種）。

---

## File Structure

- Modify: `components/home/home-selected-date-agenda.tsx` — 週表示グリッドを持つ唯一のコンポーネント。今回の4つの変更すべてこのファイル内で完結する。
- Modify: `tests/home/home-selected-date-agenda.test.tsx` — 上記コンポーネントのテスト。既存テスト1件（週グリッドの間隔クラスを直接アサートしている）の更新と、新規テスト3件の追加を行う。

## Task 1: 曜日の色分けを共有関数 `weekdayClass` に統一

自前実装の `weekdayTone`（日曜`text-clay-ink`・土曜`text-pine`・平日`text-muted`）を削除し、`lib/shared/calendar-styles.ts` の既存関数 `weekdayClass`（日曜`text-clay-ink`・土曜`text-sky-700`・平日`text-muted`）に置き換える。土曜の色が `text-pine` → `text-sky-700` に変わり、プラン作成の月カレンダー（`adjustment-calendar-view.tsx`）と同じ配色になる。

**Files:**
- Modify: `components/home/home-selected-date-agenda.tsx:12`（import追加）, `components/home/home-selected-date-agenda.tsx:78-87`（`weekdayTone`削除）, `components/home/home-selected-date-agenda.tsx:288`（呼び出し箇所置き換え）
- Test: `tests/home/home-selected-date-agenda.test.tsx`

**Interfaces:**
- Consumes: `weekdayClass(index: number): string`（`@/lib/shared/calendar-styles`、既存・変更なし。`index`は`Date.getDay()`の0-6）
- Produces: なし（内部実装の置き換えのみ、外部インターフェースへの影響なし）

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/home-selected-date-agenda.test.tsx` の `describe("HomeSelectedDateAgenda", () => {` ブロック内、既存の `it("keeps all seven date buttons in shrinkable columns", ...)` の直後に追加:

```tsx
  it("colors Sunday and Saturday weekday labels using the shared calendar convention", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-22" todayDateKey="2026-07-22" initialItems={[]} />
    );

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    const dayButtons = Array.from(dateGrid?.querySelectorAll("button") ?? []);
    const weekdayLabel = (index: number) => dayButtons[index]?.querySelector("span");

    // 週は 7/19(日) 〜 7/25(土)。選択中は7/22(水)なのでactiveの上書きを受けない。
    expect(weekdayLabel(0)).toHaveClass("text-clay-ink");
    expect(weekdayLabel(6)).toHaveClass("text-sky-700");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: FAIL（土曜のラベルが `text-pine` を持っており `text-sky-700` を持たないため）

- [ ] **Step 3: 実装する**

`components/home/home-selected-date-agenda.tsx:12` のimportを変更:

```tsx
import { Badge, Card, EmptyState, SectionHeading, Skeleton, type BadgeTone } from "@/components/ui";
```

を

```tsx
import { Badge, Card, EmptyState, SectionHeading, Skeleton, type BadgeTone } from "@/components/ui";
import { weekdayClass } from "@/lib/shared/calendar-styles";
```

に変更（`@/components/ui` の直後に追加）。

`components/home/home-selected-date-agenda.tsx:78-87` の関数を削除:

```tsx
function weekdayTone(dateKey: string) {
  const day = dateFromKey(dateKey).getDay();
  if (day === 0) {
    return "text-clay-ink";
  }
  if (day === 6) {
    return "text-pine";
  }
  return "text-muted";
}
```

`components/home/home-selected-date-agenda.tsx:288` の呼び出し箇所を変更:

```tsx
                  <span className={clsx("truncate text-[0.7rem] font-bold sm:text-caption", active ? "text-white/75" : weekdayTone(dateKey))}>
```

を

```tsx
                  <span className={clsx("truncate text-[0.7rem] font-bold sm:text-caption", active ? "text-white/75" : weekdayClass(dateFromKey(dateKey).getDay()))}>
```

に変更（`text-[0.7rem]`部分はTask 2で変更するので、ここでは触らない）。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add components/home/home-selected-date-agenda.tsx tests/home/home-selected-date-agenda.test.tsx
git commit -m "refactor: reuse shared weekdayClass in home week grid"
```

## Task 2: 週表示グリッドの余白・型スケール改善

セル間隔・セル内padding・曜日ラベル/日付数字のフォントサイズを、型スケール外の任意値からプロジェクト既定のスケールに統一しつつ広げる。

**Files:**
- Modify: `components/home/home-selected-date-agenda.tsx:274,284,288,291`
- Test: `tests/home/home-selected-date-agenda.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし（クラス名の変更のみ）

- [ ] **Step 1: 既存テストを新しいクラスを期待する形に更新する（先に失敗させる）**

`tests/home/home-selected-date-agenda.test.tsx` の既存テスト `it("keeps all seven date buttons in shrinkable columns", ...)` を変更:

```tsx
    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    expect(dateGrid).toHaveClass("grid-cols-[repeat(7,minmax(0,1fr))]", "gap-0.5", "sm:gap-1");
    expect(dateGrid?.querySelectorAll("button")).toHaveLength(7);
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("min-w-0", "px-0.5");
    }
```

を

```tsx
    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    expect(dateGrid).toHaveClass("grid-cols-[repeat(7,minmax(0,1fr))]", "gap-1", "sm:gap-1.5");
    expect(dateGrid?.querySelectorAll("button")).toHaveLength(7);
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("min-w-0", "px-1");
    }
```

に変更。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: FAIL（実装がまだ `gap-0.5`/`sm:gap-1`/`px-0.5` のため）

- [ ] **Step 3: 実装する**

`components/home/home-selected-date-agenda.tsx:274` を変更:

```tsx
          <div data-testid="home-week-grid" className="mt-3 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-0.5 sm:gap-1">
```

を

```tsx
          <div data-testid="home-week-grid" className="mt-3 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1 sm:gap-1.5">
```

`components/home/home-selected-date-agenda.tsx:284` を変更:

```tsx
                    "grid min-h-14 min-w-0 place-items-center rounded-control border px-0.5 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-16 sm:px-1",
```

を

```tsx
                    "grid min-h-14 min-w-0 place-items-center rounded-control border px-1 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-16 sm:px-1.5",
```

（フォーカスリングの`focus:ring-offset-2`追加はTask 3で行うため、ここでは`focus:outline-none focus:ring-2 focus:ring-clay`部分は触らない）

`components/home/home-selected-date-agenda.tsx:288` を変更:

```tsx
                  <span className={clsx("truncate text-[0.7rem] font-bold sm:text-caption", active ? "text-white/75" : weekdayClass(dateFromKey(dateKey).getDay()))}>
```

を

```tsx
                  <span className={clsx("truncate text-caption font-bold", active ? "text-white/75" : weekdayClass(dateFromKey(dateKey).getDay()))}>
```

`components/home/home-selected-date-agenda.tsx:291` を変更:

```tsx
                  <span className="mt-1 truncate text-xs font-bold tabular-nums sm:text-body">{shortDateLabel(dateKey)}</span>
```

を

```tsx
                  <span className="mt-1 truncate text-caption font-bold tabular-nums sm:text-body">{shortDateLabel(dateKey)}</span>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add components/home/home-selected-date-agenda.tsx tests/home/home-selected-date-agenda.test.tsx
git commit -m "style: widen home week grid spacing and align type scale"
```

## Task 3: フォーカスリングの統一（`focus:ring-offset-2`）

週送りボタン（前の週/次の週）と日付セルボタンに、`design/rules.md` が必須とする `focus:ring-offset-2` を追加する。

**Files:**
- Modify: `components/home/home-selected-date-agenda.tsx:266,269,284`
- Test: `tests/home/home-selected-date-agenda.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし（クラス名の追加のみ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/home-selected-date-agenda.test.tsx` の `describe("HomeSelectedDateAgenda", () => {` ブロック内、Task 1で追加したテストの直後に追加:

```tsx
  it("adds a ring offset to week navigation and day-cell buttons for focus visibility", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />
    );

    expect(screen.getByRole("button", { name: "前の週" })).toHaveClass("focus:ring-offset-2");
    expect(screen.getByRole("button", { name: "次の週" })).toHaveClass("focus:ring-offset-2");

    const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
    for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
      expect(button).toHaveClass("focus:ring-offset-2");
    }
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: FAIL（3種類のボタンいずれも`focus:ring-offset-2`を持たないため）

- [ ] **Step 3: 実装する**

`components/home/home-selected-date-agenda.tsx:266` を変更:

```tsx
              <button type="button" onClick={() => selectDate(previousWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay" aria-label="前の週">
```

を

```tsx
              <button type="button" onClick={() => selectDate(previousWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2" aria-label="前の週">
```

`components/home/home-selected-date-agenda.tsx:269` を変更:

```tsx
              <button type="button" onClick={() => selectDate(nextWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay" aria-label="次の週">
```

を

```tsx
              <button type="button" onClick={() => selectDate(nextWeekKey)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2" aria-label="次の週">
```

`components/home/home-selected-date-agenda.tsx:284` を変更:

```tsx
                    "grid min-h-14 min-w-0 place-items-center rounded-control border px-1 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-16 sm:px-1.5",
```

を

```tsx
                    "grid min-h-14 min-w-0 place-items-center rounded-control border px-1 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:min-h-16 sm:px-1.5",
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add components/home/home-selected-date-agenda.tsx tests/home/home-selected-date-agenda.test.tsx
git commit -m "fix: add missing focus ring offset to home week grid buttons"
```

## Task 4: `DateShortcut` を共通 `Button` ベースに統一

今日/明日/週末ショートカットの独自ボタン実装を、共通 `Button`（`@/components/ui`）に置き換える。非アクティブ時の文字色が `text-muted` から `text-ink`（共通`secondary`の色）にわずかに濃くなる（意図した変更、Global Constraints参照）。

**Files:**
- Modify: `components/home/home-selected-date-agenda.tsx:12,114-126`
- Test: `tests/home/home-selected-date-agenda.test.tsx`

**Interfaces:**
- Consumes: `Button`（`@/components/ui`、既存）。props: `variant?: "primary" | "secondary" | "danger"`（既定`"primary"`）、`onClick?`、`aria-current?`、`children: ReactNode`。`type`は既定`"button"`。
- Produces: なし（`DateShortcut`の呼び出し側インターフェース`{ onSelect, active, children }`は変更しない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/home-selected-date-agenda.test.tsx` の `describe("HomeSelectedDateAgenda", () => {` ブロック内、Task 3で追加したテストの直後に追加:

```tsx
  it("renders date shortcuts using the shared Button primitive", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />);

    expect(screen.getByRole("button", { name: "今日" })).toHaveClass("bg-ink", "text-white");
    expect(screen.getByRole("button", { name: "明日" })).toHaveClass("border-line-strong", "text-ink");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: FAIL（「明日」ボタンが`text-ink`ではなく`text-muted`を持つため）

- [ ] **Step 3: 実装する**

`components/home/home-selected-date-agenda.tsx:12` のimportを変更:

```tsx
import { Badge, Card, EmptyState, SectionHeading, Skeleton, type BadgeTone } from "@/components/ui";
```

を

```tsx
import { Badge, Button, Card, EmptyState, SectionHeading, Skeleton, type BadgeTone } from "@/components/ui";
```

`components/home/home-selected-date-agenda.tsx:114-126` の関数を変更:

```tsx
function DateShortcut({
  onSelect,
  active,
  children
}: {
  onSelect: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onSelect} aria-current={active ? "date" : undefined} className={clsx("inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2", active ? "bg-ink text-white shadow-soft" : "border border-line-strong bg-surface text-muted hover:border-moss hover:text-pine")}>{children}</button>
  );
}
```

を

```tsx
function DateShortcut({
  onSelect,
  active,
  children
}: {
  onSelect: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "primary" : "secondary"} onClick={onSelect} aria-current={active ? "date" : undefined}>
      {children}
    </Button>
  );
}
```

に変更（呼び出し側の249-260行目付近は変更不要）。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/home/home-selected-date-agenda.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add components/home/home-selected-date-agenda.tsx tests/home/home-selected-date-agenda.test.tsx
git commit -m "refactor: rebuild home date shortcuts on the shared Button primitive"
```

## 変更しないもの

- 週表示グリッドの構造（7列・前後週ナビ・今日/明日/週末ショートカットという仕組み）
- `AgendaItem`（選択日の予定一覧）
- Google Calendar連携ロジック・状態表示
- `design/tokens.css` / `tailwind.config.ts`
- `lib/shared/calendar-styles.ts`（既存・テスト済みのまま再利用するのみ）

## 最終検証

全4タスク完了後、以下を実行する。

1. `npm run typecheck`
2. `npx vitest run --reporter=dot`（全体、既存1207件+今回追加分がすべてPASS、退行がないことを確認）
3. `npm run build`
4. `npm run dev` を起動し、スマホ幅(390px)のブラウザで実機確認:
   - 週グリッドが窮屈な印象なく表示され、7列という構造・タップ領域(44px以上)は変わらないこと
   - 日曜・土曜の色分けが、プラン作成の月カレンダー（`adjustment-calendar-view.tsx`）と同じ配色（日曜`text-clay-ink`・土曜`text-sky-700`）になっていること
   - Tabキー操作で週送りボタン・日付セルにフォーカスリングが正しく表示されること（`ring-offset-2`が付いた見た目）
   - 今日/明日/週末ボタンの非アクティブ時の文字色が、共通secondaryボタンと同じ濃さ（`text-ink`）になっていること
