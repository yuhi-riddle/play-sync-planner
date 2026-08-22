# カテゴリ差し色展開(絞り込みチップ+詳細ヘッダー) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カテゴリの差し色を、既に一覧カードに実装済みの視覚言語を使って、絞り込みチップ(ドット)とイベント詳細ページの見出し(アイコンバッジ)に展開する。

**Architecture:** 既存の`lib/domain/event/category-color.ts`(色クラスの純粋マッピング)に対になる`category-icon.ts`(lucideアイコンの純粋マッピング)を新設する。詳細ヘッダーは共有`PageHeader`コンポーネントに汎用`icon`スロットを1つ追加するだけにとどめ、カテゴリの知識は呼び出し側(`app/events/[eventId]/page.tsx`)と新規の`CategoryIconBadge`コンポーネントに閉じ込める。

**Tech Stack:** Next.js App Router (RSC) / TypeScript / Tailwind CSS / clsx / lucide-react / Vitest + Testing Library

## Global Constraints

- 新規のTailwindクラスは追加しない。色は既存の`bg-category-*`(`categoryAccent().dot`)をそのまま使う
- アイコンは`lucide-react`から選ぶ(絵文字禁止、プロジェクト既存の作法)
- `PageHeader`は26画面で共有している。`icon`は省略可能にし、既存の呼び出し元の見た目を一切変えない
- モバイルの絞り込み`<select>`は変更しない(ネイティブ要素の制約でドット非対応)
- テストは`--reporter=dot`で流す(このプロジェクトの既定レポーターは170ファイル分出力してトークンを浪費するため)

---

### Task 1: `categoryIcon()` ドメイン関数

**Files:**
- Create: `lib/domain/event/category-icon.ts`
- Test: `tests/event/category-icon.test.ts`

**Interfaces:**
- Consumes: `EVENT_CATEGORIES`(`@/lib/shared/constants`、既存の8値のreadonly配列)
- Produces: `categoryIcon(category: string): LucideIcon` — Task 3の`CategoryIconBadge`がこれを呼ぶ。`LucideIcon`は`lucide-react`からexportされている型をそのまま再利用する(独自定義しない)

- [ ] **Step 1: Write the failing test**

```ts
// tests/event/category-icon.test.ts
import { describe, expect, it } from "vitest";
import { Beer, Clapperboard, Dices, MicVocal, Plane, Puzzle, Snowflake, Tag } from "lucide-react";

import { categoryIcon } from "@/lib/domain/event/category-icon";

describe("categoryIcon", () => {
  it("maps every one of the 8 categories to its lucide icon component", () => {
    expect(categoryIcon("live")).toBe(MicVocal);
    expect(categoryIcon("travel")).toBe(Plane);
    expect(categoryIcon("drinking")).toBe(Beer);
    expect(categoryIcon("nazotoki")).toBe(Puzzle);
    expect(categoryIcon("snowboard")).toBe(Snowflake);
    expect(categoryIcon("boardgame")).toBe(Dices);
    expect(categoryIcon("movie_stage")).toBe(Clapperboard);
    expect(categoryIcon("other")).toBe(Tag);
  });

  it("falls back to Tag for an unknown value", () => {
    expect(categoryIcon("not-a-real-category")).toBe(Tag);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event/category-icon.test.ts --reporter=dot`
Expected: FAIL(`category-icon`モジュールが存在しない)

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/event/category-icon.ts
import { Beer, Clapperboard, Dices, MicVocal, Plane, Puzzle, Snowflake, Tag, type LucideIcon } from "lucide-react";

import { EVENT_CATEGORIES } from "@/lib/shared/constants";

type Category = (typeof EVENT_CATEGORIES)[number];

const categoryIcons: Record<Category, LucideIcon> = {
  live: MicVocal,
  travel: Plane,
  drinking: Beer,
  nazotoki: Puzzle,
  snowboard: Snowflake,
  boardgame: Dices,
  movie_stage: Clapperboard,
  other: Tag
};

/** 未知の値(不正データ・将来の削除カテゴリ跡地)は other(Tag) 扱いにする。categoryAccent の未知値処理と揃える。 */
export function categoryIcon(category: string): LucideIcon {
  return category in categoryIcons ? categoryIcons[category as Category] : Tag;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event/category-icon.test.ts --reporter=dot`
Expected: PASS(2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/event/category-icon.ts tests/event/category-icon.test.ts
git commit -m "feat: add categoryIcon domain function mapping categories to lucide icons"
```

---

### Task 2: `PageHeader` に `icon` スロットを追加

**Files:**
- Modify: `components/ui/server.tsx:14-40`
- Test: `tests/ui/page-header.test.tsx`(新規)

**Interfaces:**
- Consumes: なし(既存コンポーネントの拡張のみ)
- Produces: `PageHeader`の新しい`icon?: ReactNode`prop。Task 4がこれに`<CategoryIconBadge />`を渡す

- [ ] **Step 1: Write the failing test**

```tsx
// tests/ui/page-header.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/ui/server";

describe("PageHeader", () => {
  it("renders the icon slot next to the title when icon is passed", () => {
    render(<PageHeader title="夏合宿 前泊なし案" icon={<span data-testid="header-icon">icon</span>} />);

    expect(screen.getByTestId("header-icon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "夏合宿 前泊なし案" })).toBeInTheDocument();
  });

  it("renders nothing extra when icon is omitted (existing callers unaffected)", () => {
    const { container } = render(<PageHeader title="設定" />);

    expect(container.querySelectorAll("[data-testid='header-icon']").length).toBe(0);
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/page-header.test.tsx --reporter=dot`
Expected: FAIL(`header-icon`が見つからない。`icon` propが存在しないため型エラーにもなる)

- [ ] **Step 3: Write minimal implementation**

`components/ui/server.tsx:14-40`を以下に置き換える:

```tsx
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  summary,
  icon
}: {
  title: string;
  description?: string;
  /** 画面のカテゴリ。省略するとブランド名になるが、原則として画面ごとの語を渡す */
  eyebrow?: string;
  action?: ReactNode;
  /** タイトルの下に出す状態の要約。バッジなどを渡す */
  summary?: ReactNode;
  /** タイトル左に置く正方形のアイコン。省略時は何も出さない */
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon}
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-pine">{eyebrow ?? brand.shortName}</p>
          <h1 className="mt-2 break-words text-display text-ink">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-body text-muted">{description}</p> : null}
          {summary ? <div className="mt-3">{summary}</div> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/page-header.test.tsx --reporter=dot`
Expected: PASS(2 tests)

続けて既存のUIテストが壊れていないことを確認する:

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS(既存テストは`icon`を渡していないので影響なし)

- [ ] **Step 5: Commit**

```bash
git add components/ui/server.tsx tests/ui/page-header.test.tsx
git commit -m "feat: add optional icon slot to PageHeader"
```

---

### Task 3: `CategoryIconBadge` コンポーネント

**Files:**
- Create: `components/event/category-icon-badge.tsx`
- Test: `tests/event/category-icon-badge.test.tsx`

**Interfaces:**
- Consumes: `categoryAccent(category: string)`(`@/lib/domain/event/category-color`、既存、`{ bar, badgeBg, badgeText, dot }`を返す) / `categoryIcon(category: string): LucideIcon`(Task 1)
- Produces: `CategoryIconBadge({ category: string }): JSX.Element`。Task 4が`app/events/[eventId]/page.tsx`から呼ぶ

- [ ] **Step 1: Write the failing test**

```tsx
// tests/event/category-icon-badge.test.tsx
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryIconBadge } from "@/components/event/category-icon-badge";

describe("CategoryIconBadge", () => {
  it("uses the category's background color class and renders an icon", () => {
    const { container } = render(<CategoryIconBadge category="travel" />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.className).toContain("bg-category-travel");
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the neutral/other styling for an unknown category", () => {
    const { container } = render(<CategoryIconBadge category="not-a-real-category" />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.className).toContain("bg-subtle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event/category-icon-badge.test.tsx --reporter=dot`
Expected: FAIL(`@/components/event/category-icon-badge`が存在しない)

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/event/category-icon-badge.tsx
import { clsx } from "clsx";

import { categoryAccent } from "@/lib/domain/event/category-color";
import { categoryIcon } from "@/lib/domain/event/category-icon";

export function CategoryIconBadge({ category }: { category: string }) {
  const accent = categoryAccent(category);
  const Icon = categoryIcon(category);

  return (
    <div className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white", accent.dot)}>
      <Icon aria-hidden="true" className="h-5 w-5" />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event/category-icon-badge.test.tsx --reporter=dot`
Expected: PASS(2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/event/category-icon-badge.tsx tests/event/category-icon-badge.test.tsx
git commit -m "feat: add CategoryIconBadge component for the event detail header"
```

---

### Task 4: イベント詳細ページの見出しにバッジを配線

**Files:**
- Modify: `app/events/[eventId]/page.tsx`(import追加 + `PageHeader`呼び出し + カテゴリ正規化)
- Test: `tests/event/event-detail-page.test.tsx`(追記)

**Interfaces:**
- Consumes: `CategoryIconBadge`(Task 3) / `normalizeCategory`(`@/lib/domain/event/event-filter`、既存。`string | undefined`を受け取り`EventCategoryFilter`(`"all" | Category`)を返す)
- Produces: なし(末端の配線)

`app/events/[eventId]/page.tsx`の現状を確認する:

```
grep -n "normalizeCategory\|categoryLabels\|PageHeader\|from \"@/lib/domain/event/event-filter\"" app/events/[eventId]/page.tsx
```

`normalizeCategory`は現状このファイルでimportされていない(一覧ページ`app/events/page.tsx`のみで使用)ので、importを追加する必要がある。

- [ ] **Step 1: Write the failing test**

`tests/event/event-detail-page.test.tsx`の`cancelledEvent()`ヘルパー(50〜61行目)は`category: "other"`固定。カテゴリを差し替えられるように引数を足し、新しいdescribeブロックを追加する。

`cancelledEvent()`の定義を以下に置き換える(既存の呼び出し元は引数なしのままで動くようデフォルト値を付ける):

```ts
function cancelledEvent(overrides: Partial<ReturnType<typeof baseEvent>> = {}) {
  return { ...baseEvent(), ...overrides };
}

function baseEvent() {
  return {
    id: "event-1",
    title: "夏の花火大会",
    status: "cancelled",
    owner_user_id: "owner-1",
    category: "other",
    location_name: null,
    url: null,
    memo: null,
    plans: []
  };
}
```

ファイル末尾に新しいdescribeブロックを追加する:

```tsx
describe("EventDetailPage - カテゴリアイコンバッジ", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  it("見出しに、イベントのカテゴリ色を背景に持つアイコンバッジを出す", async () => {
    const event = cancelledEvent({ category: "travel" });
    mockServerClient(event, null);
    mockAdminClient({ memberCount: 3, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    const { container } = render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const badge = container.querySelector(".bg-category-travel");
    expect(badge).not.toBeNull();
    expect(badge?.querySelector("svg")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: FAIL(新しいテストが`.bg-category-travel`要素を見つけられない。既存テストは`cancelledEvent()`のデフォルト値が変わっていないので影響なし)

- [ ] **Step 3: Write minimal implementation**

`app/events/[eventId]/page.tsx`に以下のimportを追加する(既存の`import { categoryLabels, planStatusLabels } from "@/lib/shared/constants";`の下、25行目付近):

```tsx
import { normalizeCategory } from "@/lib/domain/event/event-filter";
import { CategoryIconBadge } from "@/components/event/category-icon-badge";
```

`PageHeader`呼び出し(109〜126行目)の直前、`resolveEventProgress`呼び出しのあたりにカテゴリ正規化を追加する(一覧カード`app/events/page.tsx:223-224`と同一パターン):

```tsx
const normalizedCategory = normalizeCategory(event.category);
const category = normalizedCategory === "all" ? "other" : normalizedCategory;
```

`PageHeader`呼び出しに`icon`propを追加する:

```tsx
<PageHeader
  eyebrow="Event"
  title={event.title}
  icon={<CategoryIconBadge category={category} />}
  action={isOwner && canStartAdjustment ? <ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink> : null}
  summary={
    // ...既存のまま
  }
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS(既存テスト + 新規1件)

- [ ] **Step 5: Commit**

```bash
git add app/events/\[eventId\]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "feat: show category icon badge on event detail header"
```

---

### Task 5: 絞り込みチップにカテゴリドットを追加

**Files:**
- Modify: `components/event/event-category-filter.tsx`
- Test: `tests/event/event-category-filter.test.tsx`(追記)

**Interfaces:**
- Consumes: `categoryAccent(category: string)`(`@/lib/domain/event/category-color`、既存)
- Produces: なし(末端のUI変更)

- [ ] **Step 1: Write the failing test**

`tests/event/event-category-filter.test.tsx`に以下のテストを追加する:

```tsx
it("shows a category-colored dot on each chip except すべて", () => {
  const { container } = render(
    <EventCategoryFilter
      activeCategory="all"
      categoryCounts={{
        all: 3,
        live: 1,
        travel: 1,
        drinking: 1,
        nazotoki: 0,
        snowboard: 0,
        boardgame: 0,
        movie_stage: 0,
        other: 0
      }}
    />
  );

  const allChip = screen.getByRole("link", { name: "すべて" });
  expect(allChip.querySelector("span[aria-hidden='true']")).toBeNull();

  const travelChip = screen.getByRole("link", { name: "旅行" });
  const dot = travelChip.querySelector("span[aria-hidden='true']");
  expect(dot).not.toBeNull();
  expect(dot?.className).toContain("bg-category-travel");
});
```

ファイル冒頭のimportに`screen`が既にあることを確認する(1行目、既存のまま変更不要)。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event/event-category-filter.test.tsx --reporter=dot`
Expected: FAIL(チップにドット要素が無い)

- [ ] **Step 3: Write minimal implementation**

`components/event/event-category-filter.tsx`を全体的に以下へ差し替える:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

import { categoryLabels, EVENT_CATEGORIES } from "@/lib/shared/constants";
import { categoryAccent } from "@/lib/domain/event/category-color";
import {
  eventFilterHref,
  type EventCategoryCounts,
  type EventCategoryFilter as CategoryValue
} from "@/lib/domain/event/event-filter";

function FilterChip({
  href,
  active,
  dotClassName,
  children
}: {
  href: string;
  active: boolean;
  dotClassName?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-2 text-body font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      }
    >
      {dotClassName ? (
        <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/70", dotClassName)} />
      ) : null}
      {children}
    </Link>
  );
}

export function EventCategoryFilter({
  activeCategory,
  categoryCounts
}: {
  activeCategory: CategoryValue;
  categoryCounts: EventCategoryCounts;
}) {
  const router = useRouter();
  const options = [
    { value: "all" as const, label: "すべて" },
    ...EVENT_CATEGORIES.filter((category) => categoryCounts[category] > 0).map((category) => ({
      value: category,
      label: categoryLabels[category]
    }))
  ];

  return (
    <div>
      <p className="mb-2 text-eyebrow uppercase text-pine">カテゴリ</p>
      <div className="sm:hidden">
        <select
          aria-label="カテゴリで絞り込む"
          value={activeCategory}
          onChange={(event) => router.push(eventFilterHref(event.target.value as CategoryValue))}
          className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base font-medium text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            href={eventFilterHref(option.value)}
            active={activeCategory === option.value}
            dotClassName={option.value === "all" ? undefined : categoryAccent(option.value).dot}
          >
            {option.label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event/event-category-filter.test.tsx --reporter=dot`
Expected: PASS(既存1件 + 新規1件)

- [ ] **Step 5: Commit**

```bash
git add components/event/event-category-filter.tsx tests/event/event-category-filter.test.tsx
git commit -m "feat: show category-colored dots on the event filter chips"
```

---

### Task 6: 全体確認

**Files:** なし(検証のみ)

- [ ] **Step 1: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 2: lint**

Run: `npx eslint app/events/\[eventId\]/page.tsx components/ui/server.tsx components/event/category-icon-badge.tsx components/event/event-category-filter.tsx lib/domain/event/category-icon.ts`
Expected: エラー無し

- [ ] **Step 3: テスト全体**

Run: `npx vitest run --reporter=dot`
Expected: 全件PASS(既存基準線+今回追加した6件)

- [ ] **Step 4: 目視確認(dev server)**

`npm run dev`を起動し、`/events`で絞り込みチップにドットが出ること、`/events/<id>`の見出しにカテゴリ色のアイコンバッジが出ることをブラウザで確認する。設計docに記載の通りモバイル幅(375px)でも崩れないことを確認する。

- [ ] **Step 5: Codexレビュー**

このプロジェクトの方針により、mainへの反映前は`codex:rescue`または`codex-review`でレビューする(`/code-review`は使わない)。diffを渡し、Task 1〜5の変更点(特にPageHeaderの共有コンポーネント変更が既存25画面に影響しないか)を確認してもらう。
