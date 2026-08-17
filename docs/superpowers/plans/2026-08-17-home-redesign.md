# ホーム画面リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Madoi のホーム画面(`app/page.tsx`)を、生成り×濃い緑を基調にした新デザイントークンで再構成し、情報設計を「挨拶→CTA→対応が必要なこと(最優先1件プレビュー)→次の予定→選択日の予定」に整理する。

**Architecture:** `design/tokens.css`(正本)と `tailwind.config.ts`(ミラー)のトークン更新を土台に、ホーム専用の新規コンポーネント(CTAカード・下書き案内カード・優先通知カード・ロゴ)を `components/home/` と `components/layout/` に追加し、`app/page.tsx` から組み立て直す。`HomeSelectedDateAgenda` と `HomeNextConfirmedEventCard` はロジック変更なし、トークン更新の自動反映を確認するのみ。

**Tech Stack:** Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS 3 / lucide-react / clsx / Vitest + Testing Library

## Global Constraints

- `design/tokens.css` と `tailwind.config.ts` は必ず同時更新する(片方だけ直すとズレる)
- カード面は必ず不透明にする(`bg-surface/90` 等の半透明指定は禁止)
- 角丸は `rounded-card` / `rounded-control` / `rounded-full` の3値のみを使う(任意値禁止)
- 文字色は `text-ink` / `text-muted` / `text-subtle` の3段。`text-subtle` は本文・ラベルに使わない
- `moss` / `clay` / `honey` は面・線のみに使い、文字色には `text-pine` / `text-clay-ink` / `text-honey-ink` を使う
- タップ領域は `min-h-11`(44px)以上
- フォーカスは `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2`
- Zen Maru Gothic 導入時は `subsets: ["japanese"]` を必ず指定する(2026-07-13 に `latin` のみ指定して日本語グリフ0件のまま268KB読み込んでいた失敗を再発させない)
- Vitest は `--reporter=dot` で実行する(170ファイル分の既定出力を避ける)

---

### Task 1: デザイントークン更新

**Files:**
- Modify: `design/tokens.css`
- Modify: `tailwind.config.ts`
- Modify: `design/rules.md`

**Interfaces:**
- Produces: CSS変数 `--madoi-canvas`(値変更)、`--madoi-pine-deep`(新規)、`--madoi-radius-card`(値変更)、`--madoi-radius-control`(値変更)。Tailwind側 `bg-canvas` `bg-pine-deep` `rounded-card` `rounded-control` として後続タスクから参照される。

- [ ] **Step 1: tokens.css を更新する**

`design/tokens.css` の該当行を編集する:

```css
  --madoi-canvas: #f7f3ef; /* ページの地 */
```

```css
  --madoi-ink: #23262b; /* 見出し・本文の黒。主CTAには使わない */
  --madoi-moss: #5f7d65; /* 線・アイコン・面。文字には使わない（AA不足） */
  --madoi-pine: #344f43; /* 強調文字・確定・hover・主CTAの起点色 */
  --madoi-pine-deep: #2c4638; /* 主CTAグラデーションの終端色 */
```

```css
  /* ---- 角丸: 3値のみ ---- */
  --madoi-radius-card: 20px;
  --madoi-radius-control: 14px;
```

- [ ] **Step 2: tailwind.config.ts を同期する**

`tailwind.config.ts` の `colors` と `borderRadius` を編集する:

```ts
        canvas: "#f7f3ef",
        surface: "#fffdf7",
        sunken: "#f6f0e4",

        // 旧名。canvas / surface のエイリアスとして残す
        paper: "#f7f3ef",
        cream: "#fffdf7",
```

```ts
        ink: "#262320", // 本文・見出し。主CTAには使わない
        muted: "#6f665c", // 補足・ラベル
        subtle: "#948a7d", // 装飾専用。AA不足なので本文に使わない

        // アクセント: 値ではなく「使い道」を決めてある
        moss: "#5f7d65", // 線・アイコン・面
        pine: "#344f43", // 強調文字・確定・hover・主CTAグラデーションの起点
        "pine-deep": "#2c4638", // 主CTAグラデーションの終端
        clay: "#df7d69", // 期限・要対応（面/線）
```

```ts
      borderRadius: {
        card: "20px",
        control: "14px"
      },
```

- [ ] **Step 3: rules.md の角丸節と色の意味表を更新する**

`design/rules.md` の「角丸」節を編集する:

```markdown
**NG: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl` など任意の値**
**代替: `rounded-card`(20px) / `rounded-control`(14px) / `rounded-full` の3値のみ**
```

「色の意味」表の `ink` 行を編集し、`pine-deep` 行を追加する:

```markdown
| `ink` | 本文・見出し | 通常のテキスト色。主CTAの背景には使わない |
| `pine` / `pine-deep` | 主アクション・強調・確定 | 主CTAボタンの背景（`from-pine to-pine-deep` のグラデーション）、強調文字、hover、確定状態 |
```

- [ ] **Step 4: 変更を確認する**

Run: `git -C "D:\System\projects\play-sync-planner\.claude\worktrees\home-redesign-spec" diff design/tokens.css tailwind.config.ts design/rules.md`
Expected: 3ファイルとも上記の差分のみが表示される

- [ ] **Step 5: Commit**

```bash
git add design/tokens.css tailwind.config.ts design/rules.md
git commit -m "style: lighten canvas, enlarge radius, add pine-deep token for CTA gradient"
```

---

### Task 2: 通知の優先順位ロジック

**Files:**
- Modify: `lib/domain/shared/site-notifications.ts`
- Test: `tests/shared/site-notifications.test.ts`

**Interfaces:**
- Produces: `selectPriorityNotification<T extends { kind: string; created_at?: string }>(notifications: T[]): T | null` — Task 7 (`app/page.tsx`)が使用

- [ ] **Step 1: 失敗するテストを書く**

`tests/shared/site-notifications.test.ts` の末尾に追加する:

```ts
import { selectPriorityNotification } from "@/lib/domain/shared/site-notifications";

describe("selectPriorityNotification", () => {
  it("returns null for an empty list", () => {
    expect(selectPriorityNotification([])).toBeNull();
  });

  it("prioritizes payment_due over unanswered regardless of recency", () => {
    const notifications = [
      { kind: "unanswered", created_at: "2026-08-10T00:00:00Z" },
      { kind: "payment_due", created_at: "2026-08-09T00:00:00Z" }
    ];

    expect(selectPriorityNotification(notifications)?.kind).toBe("payment_due");
  });

  it("treats answer_deadline and payment_due as the same top tier", () => {
    const notifications = [
      { kind: "answer_deadline", created_at: "2026-08-09T00:00:00Z" },
      { kind: "payment_due", created_at: "2026-08-10T00:00:00Z" }
    ];

    expect(selectPriorityNotification(notifications)?.kind).toBe("payment_due");
  });

  it("falls back to newest created_at within the same tier", () => {
    const notifications = [
      { kind: "settlement_needed", created_at: "2026-08-08T00:00:00Z" },
      { kind: "confirmation_due", created_at: "2026-08-11T00:00:00Z" }
    ];

    expect(selectPriorityNotification(notifications)?.kind).toBe("confirmation_due");
  });

  it("ignores kinds with no action filter", () => {
    const notifications = [{ kind: "event_message", created_at: "2026-08-11T00:00:00Z" }];

    expect(selectPriorityNotification(notifications)?.kind).toBe("event_message");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/shared/site-notifications.test.ts --reporter=dot`
Expected: FAIL — `selectPriorityNotification is not a function` 相当のエラー

- [ ] **Step 3: 実装を追加する**

`lib/domain/shared/site-notifications.ts` の `actionFilterForKind` 関数の直後に追加する:

```ts
const priorityFilterRank: Record<Exclude<NotificationActionFilter, "all">, number> = {
  payment: 0,
  deadline: 0,
  settlement: 1,
  confirmation: 1,
  unanswered: 2
};

function priorityRankForKind(kind: string): number {
  const filter = actionFilterForKind(kind);
  if (!filter || filter === "all") {
    return 99;
  }

  return priorityFilterRank[filter];
}

/** 「対応が必要なこと」カードに1件だけプレビュー表示するとき、支払い・期限を最優先にする。 */
export function selectPriorityNotification<T extends { kind: string; created_at?: string }>(
  notifications: T[]
): T | null {
  if (notifications.length === 0) {
    return null;
  }

  return [...notifications].sort((a, b) => {
    const rankDiff = priorityRankForKind(a.kind) - priorityRankForKind(b.kind);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0];
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/shared/site-notifications.test.ts --reporter=dot`
Expected: PASS (5 new tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/shared/site-notifications.ts tests/shared/site-notifications.test.ts
git commit -m "feat: add selectPriorityNotification for home priority card"
```

---

### Task 3: ロゴのコンポーネント化

**Files:**
- Create: `components/layout/logo.tsx`
- Modify: `app/layout.tsx:49-58`

**Interfaces:**
- Produces: `Logo({ className }: { className?: string })` — Task で `app/layout.tsx` から使用

- [ ] **Step 1: Logo コンポーネントを作成する**

`components/layout/logo.tsx` を新規作成する:

```tsx
/** 山＋太陽のロゴマーク。写実的な質感の作り込みは別タスク。トークンの CSS 変数を直接参照する。 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" fill="none" aria-hidden="true" className={className}>
      <circle cx="18.5" cy="6.5" r="4.2" fill="var(--madoi-honey)" />
      <path d="M1 20.5 8.5 8l4.6 6.8 2.6-3.4L25 20.5H1z" fill="var(--madoi-pine-deep)" />
      <path d="M1 20.5 8.5 8l4.6 6.8-3.2 5.7H1z" fill="var(--madoi-pine)" />
    </svg>
  );
}
```

- [ ] **Step 2: app/layout.tsx のロゴ実装を差し替える**

`app/layout.tsx` の import に追加する:

```tsx
import { Logo } from "@/components/layout/logo";
```

`app/layout.tsx:49-58` を置き換える:

```tsx
              <Link href="/" className="group flex items-center gap-3 text-lg font-bold tracking-normal text-ink">
                <Logo className="h-8 w-8 sm:h-10 sm:w-10" />
                <span>{brand.name}</span>
              </Link>
```

- [ ] **Step 3: 表示確認**

Run: `npm run dev` を起動し、ブラウザで `http://localhost:3000` のヘッダーを確認する
Expected: 幾何学的三角形2枚だったロゴが、山2レイヤー＋太陽のSVGに置き換わっている

- [ ] **Step 4: Commit**

```bash
git add components/layout/logo.tsx app/layout.tsx
git commit -m "refactor: extract header logo into Logo component with mountain+sun mark"
```

---

### Task 4: Zen Maru Gothic の導入

**Files:**
- Modify: `app/layout.tsx`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: CSS変数 `--font-zen-maru-gothic`(`html` 要素に付与)、Tailwind `font-sans` から参照

- [ ] **Step 1: next/font/google でフォントを読み込む**

`app/layout.tsx` の import に追加する:

```tsx
import { Zen_Maru_Gothic } from "next/font/google";
```

`RootLayout` 関数の直前に追加する:

```tsx
const zenMaruGothic = Zen_Maru_Gothic({
  subsets: ["japanese"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-zen-maru-gothic"
});
```

`<html lang="ja">` を編集する:

```tsx
    <html lang="ja" className={zenMaruGothic.variable}>
```

- [ ] **Step 2: tailwind.config.ts のフォントスタックを更新する**

`tailwind.config.ts` のコメントと `fontFamily.sans` を編集する:

```ts
      /*
       * Zen Maru Gothic を next/font/google 経由でセルフホスト。
       * 2026-07-13 に Zen Kaku Gothic New を撤去した際の失敗は「日本語Webフォントが重いから」
       * ではなく設定ミス（subsets が latin のみで日本語グリフ0件のまま268KBを読み込んでいた）
       * だったため、再導入時は subsets: ["japanese"] を必ず指定し、有効になっているか目視確認する。
       */
      fontFamily: {
        sans: [
          "var(--font-zen-maru-gothic)",
          "system-ui",
          "-apple-system",
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "BIZ UDPGothic",
          "Meiryo",
          "sans-serif"
        ]
      },
```

- [ ] **Step 3: 日本語グリフが実際に効いているか確認する**

Run: `npm run dev` を起動し、ブラウザの DevTools → Network → Font で読み込まれたフォントファイルを確認する。Elements パネルで日本語テキストの Computed Font を確認する。
Expected: `Zen Maru Gothic` が日本語テキストの Computed Font として表示され、`latin` サブセットのみの読み込みになっていない

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx tailwind.config.ts
git commit -m "feat: adopt Zen Maru Gothic via next/font/google with japanese subset"
```

---

### Task 5: ホームCTAカード

**Files:**
- Create: `components/home/home-create-event-cta.tsx`
- Test: `tests/home/home-create-event-cta.test.tsx`

**Interfaces:**
- Produces: `HomeCreateEventCta({ href }: { href?: string })` — デフォルト `href="/events/new"`。Task 8 (`app/page.tsx`)が使用

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/home-create-event-cta.test.tsx` を新規作成する:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeCreateEventCta } from "@/components/home/home-create-event-cta";

describe("HomeCreateEventCta", () => {
  it("links to /events/new by default", () => {
    render(<HomeCreateEventCta />);

    const link = screen.getByRole("link", { name: /イベントを作成する/ });
    expect(link).toHaveAttribute("href", "/events/new");
  });

  it("shows the supporting subtext", () => {
    render(<HomeCreateEventCta />);

    expect(screen.getByText("新しい予定をみんなで調整しましょう")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/home/home-create-event-cta.test.tsx --reporter=dot`
Expected: FAIL — モジュールが見つからない

- [ ] **Step 3: コンポーネントを実装する**

`components/home/home-create-event-cta.tsx` を新規作成する:

```tsx
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

export function HomeCreateEventCta({ href = "/events/new" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-card bg-gradient-to-br from-pine to-pine-deep p-5 shadow-soft transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
    >
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-control bg-white/15">
        <Plus aria-hidden="true" className="h-5 w-5 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-title text-white">イベントを作成する</span>
        <span className="mt-1 block text-caption text-white/80">新しい予定をみんなで調整しましょう</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 flex-none text-white/70" />
    </Link>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/home/home-create-event-cta.test.tsx --reporter=dot`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/home/home-create-event-cta.tsx tests/home/home-create-event-cta.test.tsx
git commit -m "feat: add HomeCreateEventCta as the primary home CTA card"
```

---

### Task 6: 下書き案内カードの抽出

**Files:**
- Create: `components/home/home-draft-resume-card.tsx`
- Modify: `app/page.tsx`(Task 8 でまとめて配線する。ここではコンポーネントの切り出しのみ)

**Interfaces:**
- Produces: `HomeDraftResumeCard({ resumeHref, onDiscard }: { resumeHref: string; onDiscard: (formData: FormData) => void | Promise<void> })`

- [ ] **Step 1: 既存JSXをコンポーネントに切り出す**

`app/page.tsx:238-254` にある `eventDraft` 案内ブロックを、`components/home/home-draft-resume-card.tsx` として新規作成する(見た目・クラス名は変更しない):

```tsx
import { ButtonLink } from "@/components/ui";

export function HomeDraftResumeCard({
  resumeHref,
  onDiscard
}: {
  resumeHref: string;
  onDiscard: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="rounded-control border border-moss/24 bg-mist p-4">
      <span className="block text-body font-bold text-ink">イベント作成の下書き</span>
      <span className="mt-1 block text-body text-muted">入力途中のイベントがあります。続きから作成できます。</span>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href={resumeHref}>続きから入力</ButtonLink>
        <form action={onDiscard}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            下書きを破棄
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェックを通す**

Run: `npx tsc --noEmit`
Expected: `home-draft-resume-card.tsx` に関するエラーが出ない(`discardEventDraftAction` の型が `onDiscard` と合致することを確認)

- [ ] **Step 3: Commit**

```bash
git add components/home/home-draft-resume-card.tsx
git commit -m "refactor: extract event draft resume banner into HomeDraftResumeCard"
```

---

### Task 7: 対応が必要なことプレビューカード

**Files:**
- Create: `components/home/home-priority-notification-card.tsx`
- Test: `tests/home/home-priority-notification-card.test.tsx`

**Interfaces:**
- Consumes: なし(count / title / href を親から受け取るだけの表示コンポーネント)
- Produces: `HomePriorityNotificationCard({ count, title, href }: { count: number; title: string; href: string })` — `count <= 0` のとき `null` を返す。Task 8 (`app/page.tsx`)が使用

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/home-priority-notification-card.test.tsx` を新規作成する:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePriorityNotificationCard } from "@/components/home/home-priority-notification-card";

describe("HomePriorityNotificationCard", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<HomePriorityNotificationCard count={0} title="" href="/notifications" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count and the priority notification title", () => {
    render(<HomePriorityNotificationCard count={3} title="支払い待ちがあります" href="/notifications" />);

    expect(screen.getByText("3件")).toBeInTheDocument();
    expect(screen.getByText("支払い待ちがあります")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/notifications");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/home/home-priority-notification-card.test.tsx --reporter=dot`
Expected: FAIL — モジュールが見つからない

- [ ] **Step 3: コンポーネントを実装する**

`components/home/home-priority-notification-card.tsx` を新規作成する:

```tsx
import Link from "next/link";
import { ChevronRight, CircleAlert } from "lucide-react";

export function HomePriorityNotificationCard({
  count,
  title,
  href
}: {
  count: number;
  title: string;
  href: string;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-card border border-l-4 border-line border-l-clay bg-surface p-4 shadow-raise transition-colors hover:border-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-control bg-clay">
        <CircleAlert aria-hidden="true" className="h-4 w-4 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-caption font-bold text-clay-ink">
          対応が必要なこと
          <span className="rounded-full bg-clay px-2 py-0.5 text-[10px] font-bold text-white">{count}件</span>
        </span>
        <span className="mt-1 block truncate text-body font-bold text-ink">{title}</span>
      </span>
      <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 flex-none text-clay-ink" />
    </Link>
  );
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/home/home-priority-notification-card.test.tsx --reporter=dot`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/home/home-priority-notification-card.tsx tests/home/home-priority-notification-card.test.tsx
git commit -m "feat: add HomePriorityNotificationCard for the home screen"
```

---

### Task 8: app/page.tsx の再構成

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `HomeCreateEventCta`(Task 5)、`HomeDraftResumeCard`(Task 6)、`HomePriorityNotificationCard`(Task 7)、`selectPriorityNotification`(Task 2)、既存の `HomeNextConfirmedEventCard` / `HomeSelectedDateAgenda` / `findNextConfirmedItem` / `filterNotificationsByActionFilter` / `getEventDraftResumePath` / `discardEventDraftAction`

- [ ] **Step 1: import を整理する**

`app/page.tsx` 冒頭の import ブロックを次のように置き換える(不要になった `Bell` `CalendarPlus` `Check` `clsx` `Badge` `ButtonLink` `EmptyState` `SecondaryLink` `SectionHeading` `type BadgeTone` を削除し、新規コンポーネントを追加):

```tsx
import { HomeCreateEventCta } from "@/components/home/home-create-event-cta";
import { HomeDraftResumeCard } from "@/components/home/home-draft-resume-card";
import { HomeNextConfirmedEventCard } from "@/components/home/home-next-confirmed-event-card";
import { HomePriorityNotificationCard } from "@/components/home/home-priority-notification-card";
import { HomeSelectedDateAgenda } from "@/components/home/home-selected-date-agenda";
import { PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/ui/state-panels";
import { discardEventDraftAction } from "@/lib/actions/event/events";
import { getEventDraftResumePath } from "@/lib/domain/event/event-flow";
import { findNextConfirmedItem, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import {
  filterNotificationsByActionFilter,
  selectPriorityNotification
} from "@/lib/domain/shared/site-notifications";
import { createSupabaseServerClient, getCurrentUser, hasSupabaseEnv } from "@/lib/supabase/server";
```

`Link` の import と `CalendarRpcRow` / `NotificationRow` 型定義、`tokyoDateKey` / `normalizeBaseDate` / `toCalendarItems` 関数は変更しないので残す。

- [ ] **Step 2: フィルターチップ関連のコードを削除する**

`app/page.tsx` から以下を削除する:
- `actionFilterOptions` 定数
- `normalizeActionFilter` 関数
- `homeFilterHref` 関数
- `notificationBadge` 関数
- `safeInternalHref` 関数

- [ ] **Step 3: HomePage 関数のシグネチャと通知処理を書き換える**

`searchParams` の型から `action` を削除する:

```tsx
export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
```

`requestedActionFilter` / `activeActionFilter` / `filteredNotifications` / `visibleFilterOptions` の算出ブロックを削除し、代わりに以下を追加する:

```tsx
  const unreadNotifications = (notifications ?? []) as NotificationRow[];
  const actionableNotifications = filterNotificationsByActionFilter(unreadNotifications, "all");
  const priorityNotification = selectPriorityNotification(actionableNotifications);
```

- [ ] **Step 4: JSX を新しい構成に書き換える**

`return` 以下のJSXを次の構成に置き換える:

```tsx
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display text-ink">{greetingTitle(profile?.nickname, user.email)}</h1>
        <p className="mt-2 text-body text-muted">予定の共有も、やりとりも、Madoiひとつで、もっとかんたんに。</p>
      </div>

      <HomeCreateEventCta />

      {eventDraft ? (
        <HomeDraftResumeCard resumeHref={getEventDraftResumePath()} onDiscard={discardEventDraftAction} />
      ) : null}

      <HomePriorityNotificationCard
        count={actionableNotifications.length}
        title={priorityNotification?.title ?? ""}
        href="/notifications"
      />

      {nextConfirmedItem ? <HomeNextConfirmedEventCard item={nextConfirmedItem} /> : null}

      <HomeSelectedDateAgenda selectedDateKey={baseDateKey} todayDateKey={todayDateKey} initialItems={calendarItems} />
    </div>
  );
}
```

`hasSupabaseEnv()` が false の場合の early return (`PageHeader` + `SetupPanel`)は変更しない。`greetingTitle` 関数は変更しない(呼び出し位置が `description` から見出しの `h1` に変わるのみ)。

- [ ] **Step 5: 型チェックを通す**

Run: `npx tsc --noEmit`
Expected: エラーなし。`PageHeader` を home のメイン return で使わなくなったが、early return 側で使い続けているため import は残す(Step 1 の import リストに含まれている点を確認)

- [ ] **Step 6: 既存テストを実行し、フィルター削除に起因する失敗を確認する**

Run: `npx vitest run tests/home --reporter=dot`
Expected: `home-profile-greeting.test.tsx` は "こんにちは、〇〇 さん" のテキストが `h1` に移動しても引き続き PASS するはず。`home-query-parallel.test.ts` など、`action` クエリパラメータやフィルターチップUIに依存するテストが FAIL した場合は、該当テストを開いて「フィルターチップUIをホームから撤去した」仕様変更に起因する箇所か確認し、その部分のみ更新する(通知取得の並列クエリ自体のテストは残す)。

- [ ] **Step 7: 手動確認**

Run: `npm run dev` を起動し、ブラウザで以下を確認する:
- 挨拶が独立した見出しになっている
- CTAカードが本文に大きく表示される
- 通知がある状態で「対応が必要なこと」カードに件数と最優先1件のタイトルが出る
- 通知が0件のとき、カードごと表示されない
- 下書きがある状態で下書き案内カードが出る

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx tests/home
git commit -m "refactor: rebuild home page layout around CTA and priority notification card"
```

---

### Task 9: 選択日の予定・次の予定カードのトークン反映確認

**Files:**
- No changes expected(確認タスク)。差分が必要な場合のみ:
  - Modify: `components/home/home-selected-date-agenda.tsx`
  - Modify: `components/home/home-next-confirmed-event-card.tsx`

**Interfaces:**
- Consumes: Task 1 で更新した `rounded-card` / `rounded-control` トークン

- [ ] **Step 1: 任意値の角丸が残っていないか確認する**

Run: `grep -n "rounded-\[" components/home/home-selected-date-agenda.tsx components/home/home-next-confirmed-event-card.tsx`
Expected: 何もヒットしない(両ファイルとも `rounded-control` / `rounded-full` のみを使っているため、Task 1 のトークン変更で自動的に反映される)

- [ ] **Step 2: ブラウザで実際の見た目を確認する**

Run: `npm run dev` を起動し、ホーム画面の「次の予定」カードと「選択日の予定」パネル(今日/明日/週末ショートカット、週間グリッド、アジェンダ一覧)の角丸が拡大されていることを目視確認する

Expected: ヒットがあった場合のみ、該当箇所を `rounded-control` に置き換えて再確認する。ヒットが無ければ変更不要、このタスクはコミットなしで完了とする。

---

## Self-Review Notes

- **Spec coverage**: トークン刷新(Task 1)、ロゴ(Task 3)、フォント(Task 4)、CTA(Task 5)、対応が必要なことプレビューカード(Task 2, 7, 8)、次の予定・選択日の予定の踏襲(Task 9)、Googleカレンダー案内カードを新規に作らない(Task 8 のJSXに独立カードを含めていないことで担保)、下部タブナビは変更なし(spec通り、タスク化していない)。spec本文にあった「対応が必要なこと」の情報設計・「選択日の予定」フル復活は Task 7/8 でカバー済み。
- **既存コードとの差分**: spec の「CTA背景 ink→pine」は、共通コンポーネント `ButtonLink`(`bg-ink`)や `HomeSelectedDateAgenda` の日付選択アクティブ状態(`bg-ink`)には適用しない。これらは他画面と共有するパターンであり、全面変更は本 spec のスコープ外(冒頭に明記の通り、全画面変更は別 spec)。新設する `HomeCreateEventCta` のみ `pine`グラデーションを使う。
- **型整合性**: `selectPriorityNotification` は `{ kind: string; created_at?: string }` を満たす任意の型を受け取るジェネリックにしてあるため、`app/page.tsx` の `NotificationRow`(`created_at: string`)にもそのまま適用できる。
