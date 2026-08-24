# イベント一覧のカテゴリ絞り込みに色を出す Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/events` の「条件を変える」を開いたとき、カテゴリの `<select>` 周りに選択中カテゴリの色を出す。

**Architecture:** `lib/domain/event/category-color.ts` の `CategoryAccentClasses` に select の枠線色用フィールドを1つ追加し、`components/event/event-list-controls.tsx` のカテゴリ `<label>`/`<select>` でそれを使う。新規コンポーネント・クライアントコンポーネント化は行わない。

**Tech Stack:** Next.js (App Router) / React / TypeScript / Tailwind CSS / Vitest + Testing Library

## Global Constraints

- ネイティブ `<select>` の `<option>` には色を乗せない(ブラウザ実装依存で信頼できないため)。
- カテゴリが `"all"` のときは色を一切付けない。
- 新しい色の値(hex・CSS変数)は追加しない。既存の `--madoi-category-*` トークン(`tailwind.config.ts` の `category-*` 色)のみ使う。
- `<select>` の構造・`<option>` 一覧・フォームの `action="/events"` は変更しない。
- 新規コンポーネント・`"use client"` 化は行わない。
- 状態チップ(進行中/下書き/完了/中止)・表示順・表示件数の `<select>` には手を入れない。
- 畳んでいる「条件を変える」summary の見た目(閉じている初期表示)は変更しない。
- テストは `npx vitest run <path> --reporter=dot` で実行する(既定の verbose レポーターは出力が多すぎる)。

---

### Task 1: `categoryAccent` に select 枠線用のクラスを追加する

**Files:**
- Modify: `lib/domain/event/category-color.ts:3-63`
- Test: `tests/event/category-color.test.ts:6-13`, `tests/event/category-color.test.ts:21-28`

**Interfaces:**
- Consumes: なし(既存の `EVENT_CATEGORIES` のみ)
- Produces: `CategoryAccentClasses.fieldBorder: string` — Task 2 が `categoryAccent(category).fieldBorder` として使う。各カテゴリの値は `` `border-category-${slug}` ``(`movie_stage` は `border-category-movie-stage`)、フォールバック(`other`・未知の値)は `"border-line-strong"`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/category-color.test.ts` の1つ目のテストを次のように変更する(`fieldBorder` の行を追加):

```ts
  it("returns the matching accent classes for a known category", () => {
    expect(categoryAccent("nazotoki")).toEqual({
      bar: "border-l-category-nazotoki",
      badgeBg: "bg-category-nazotoki/16",
      badgeText: "text-category-nazotoki-ink",
      dot: "bg-category-nazotoki",
      fieldBorder: "border-category-nazotoki"
    });
  });
```

3つ目のテストも次のように変更する(`fieldBorder` の行を追加):

```ts
  it("falls back to the other/neutral accent for an unknown value", () => {
    expect(categoryAccent("not-a-real-category")).toEqual({
      bar: "border-l-line-strong",
      badgeBg: "bg-sunken",
      badgeText: "text-muted",
      dot: "bg-subtle",
      fieldBorder: "border-line-strong"
    });
  });
```

2つ目・4つ目のテストは変更不要(`dot` のみ比較、または他テストとの等価比較のため)。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/category-color.test.ts --reporter=dot`
Expected: FAIL — `nazotoki` と `not-a-real-category` の2件が、`fieldBorder` プロパティの不一致(実際のオブジェクトに `fieldBorder` が存在しない)で失敗する。

- [ ] **Step 3: `category-color.ts` に `fieldBorder` を実装する**

`lib/domain/event/category-color.ts` の3-63行目を次で置き換える:

```ts
export type CategoryAccentClasses = {
  bar: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
  fieldBorder: string;
};

type Category = (typeof EVENT_CATEGORIES)[number];

const otherAccent: CategoryAccentClasses = {
  bar: "border-l-line-strong",
  badgeBg: "bg-sunken",
  badgeText: "text-muted",
  dot: "bg-subtle",
  fieldBorder: "border-line-strong"
};

const categoryAccents: Record<Category, CategoryAccentClasses> = {
  live: {
    bar: "border-l-category-live",
    badgeBg: "bg-category-live/16",
    badgeText: "text-category-live-ink",
    dot: "bg-category-live",
    fieldBorder: "border-category-live"
  },
  travel: {
    bar: "border-l-category-travel",
    badgeBg: "bg-category-travel/16",
    badgeText: "text-category-travel-ink",
    dot: "bg-category-travel",
    fieldBorder: "border-category-travel"
  },
  drinking: {
    bar: "border-l-category-drinking",
    badgeBg: "bg-category-drinking/16",
    badgeText: "text-category-drinking-ink",
    dot: "bg-category-drinking",
    fieldBorder: "border-category-drinking"
  },
  nazotoki: {
    bar: "border-l-category-nazotoki",
    badgeBg: "bg-category-nazotoki/16",
    badgeText: "text-category-nazotoki-ink",
    dot: "bg-category-nazotoki",
    fieldBorder: "border-category-nazotoki"
  },
  snowboard: {
    bar: "border-l-category-snowboard",
    badgeBg: "bg-category-snowboard/16",
    badgeText: "text-category-snowboard-ink",
    dot: "bg-category-snowboard",
    fieldBorder: "border-category-snowboard"
  },
  boardgame: {
    bar: "border-l-category-boardgame",
    badgeBg: "bg-category-boardgame/16",
    badgeText: "text-category-boardgame-ink",
    dot: "bg-category-boardgame",
    fieldBorder: "border-category-boardgame"
  },
  movie_stage: {
    bar: "border-l-category-movie-stage",
    badgeBg: "bg-category-movie-stage/16",
    badgeText: "text-category-movie-stage-ink",
    dot: "bg-category-movie-stage",
    fieldBorder: "border-category-movie-stage"
  },
  other: otherAccent
};
```

(65行目以降の `export function categoryAccent(...)` はそのまま変更しない。)

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/category-color.test.ts --reporter=dot`
Expected: PASS(4件とも成功)

- [ ] **Step 5: コミット**

```bash
git add lib/domain/event/category-color.ts tests/event/category-color.test.ts
git commit -m "feat: add select border accent to category color tokens"
```

---

### Task 2: カテゴリの `<select>` に選択中カテゴリの色を出す

**Files:**
- Modify: `components/event/event-list-controls.tsx:1-17`(import と `selectClassName`)
- Modify: `components/event/event-list-controls.tsx:34-48`(コンポーネント冒頭のローカル変数)
- Modify: `components/event/event-list-controls.tsx:165-175`(カテゴリの `<label>`/`<select>`)
- Test: `tests/event/event-list-controls.test.tsx`(末尾に追加)

**Interfaces:**
- Consumes: Task 1 で追加した `categoryAccent(category: string).fieldBorder`(`.dot` は既存)
- Produces: なし(末端のUI変更)

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/event-list-controls.test.tsx` の末尾(268行目、`});` の直前)に次の2件を追加する:

```tsx
  it("カテゴリがすべてなら色ドットも枠色も出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const select = screen.getByRole("combobox", { name: "カテゴリ" });
    expect(select).toHaveClass("border-line-strong", "bg-surface");
    expect(select.closest("label")?.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("カテゴリを選んでいれば選択中カテゴリの色をラベルとselectに出す", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "nazotoki", sort: "newest", pageSize: 10, page: 1, search: "" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const select = screen.getByRole("combobox", { name: "カテゴリ" });
    expect(select).toHaveClass("border-category-nazotoki", "bg-category-nazotoki/16");
    const dot = select.closest("label")?.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-category-nazotoki");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/event-list-controls.test.tsx --reporter=dot`
Expected: FAIL — 追加した2件が失敗する(1件目は select が `border-category-nazotoki` 等の色クラスを持たないため元々は通るはずが、2件目は色ドット `span[aria-hidden="true"]` が存在しないため失敗、または select に色クラスが付いていないため失敗)。

- [ ] **Step 3: `event-list-controls.tsx` を実装する**

まず1-17行目の import と `selectClassName` を次で置き換える:

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import React from "react";

import { categoryLabels, EVENT_CATEGORIES } from "@/lib/shared/constants";
import { categoryAccent } from "@/lib/domain/event/category-color";
import {
  buildEventListHref,
  EVENT_LIST_PAGE_SIZES,
  EVENT_SEARCH_MAX_LENGTH,
  type EventListFilter,
  type EventListPagination,
  type EventListQuery,
  type EventListSort
} from "@/lib/domain/event/event-filter";

const selectBaseClassName =
  "mt-2 min-h-11 w-full rounded-control border px-3 py-2 text-base font-medium text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20";

const selectClassName = `${selectBaseClassName} border-line-strong bg-surface`;
```

次に、34-48行目(`export function EventListControls({...}) {` から `detailSummary` の定義まで)の末尾、`detailSummary` の定義の直後に次の2行を追加する:

```tsx
  const categoryAccentClasses = query.category === "all" ? null : categoryAccent(query.category);
  const categorySelectClassName = categoryAccentClasses
    ? `${selectBaseClassName} ${categoryAccentClasses.fieldBorder} ${categoryAccentClasses.badgeBg}`
    : selectClassName;
```

最後に、165-175行目のカテゴリの `<label>` を次で置き換える:

```tsx
          <label className="text-body font-medium text-muted">
            <span className="inline-flex items-center gap-1.5">
              {categoryAccentClasses ? (
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${categoryAccentClasses.dot}`} />
              ) : null}
              カテゴリ
            </span>
            <select name="category" defaultValue={query.category} className={categorySelectClassName}>
              <option value="all">すべて</option>
              {EVENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/event-list-controls.test.tsx --reporter=dot`
Expected: PASS(全件成功。既存の「カテゴリ・表示順・表示件数はGETフォームのまま残す」等のテストも壊れていないこと)

- [ ] **Step 5: コミット**

```bash
git add components/event/event-list-controls.tsx tests/event/event-list-controls.test.tsx
git commit -m "feat: show category color on the event list category select"
```

---

### Task 3: 全体テストと実機確認

**Files:** なし(検証のみ)

- [ ] **Step 1: プロジェクト全体のテストを実行する**

Run: `npx vitest run --reporter=dot`
Expected: PASS(全件成功。既存の他コンポーネントのテストに影響がないこと)

- [ ] **Step 2: 375px幅で実機確認する**

開発サーバーを起動し(`npm run dev`)、ブラウザの幅を375pxにして `/events` を開く。

- カテゴリを指定しない状態で「条件を変える」が閉じていること、開閉しても閉じている間の高さが変わらないこと
- 「条件を変える」を開いたとき、カテゴリの `<select>` の枠線・背景・ラベル横のドットに、選択中カテゴリの色(例: `謎解き` なら紫系)が出ること
- カテゴリを「すべて」に戻すと色が消え、枠線が中立色(`border-line-strong`)に戻ること
- 状態チップ・表示順・表示件数の見た目に変化がないこと

- [ ] **Step 3: コミット不要(検証のみのタスクのため)**

## Self-Review

- **Spec coverage**: 「対象」(カテゴリのlabel/select)→Task 2、「色は既存トークンを流用」→Task 1(`fieldBorder` は既存の `category-*` Tailwind色を参照するのみで新規hexなし)、「allのとき色なし」→Task 2 のテスト1件目、「新規コンポーネント不要」→Task 2 はサーバーコンポーネントのまま、「畳んでいる時の見た目変更なし」→Task 2 は `<details>` の外側やsummaryに触れない、「状態チップ等は変更なし」→どのタスクも触れていない。すべてカバーしている。
- **Placeholder scan**: 各ステップに実コードを記載済み。TBD等の記述なし。
- **Type consistency**: `CategoryAccentClasses.fieldBorder`(Task 1)と `categoryAccentClasses.fieldBorder`(Task 2)で名称・型(string)が一致している。`categoryAccent(query.category)` の引数型(`string`)も `EventListQuery["category"]` と互換。
