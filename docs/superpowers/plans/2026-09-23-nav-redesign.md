# ナビ再設計（Batch B）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通知を下部ナビの5項目目へ移し、ヘッダー右上を「アバター＋設定」1つにする。あわせて、下部ナビ・FAB・下余白の表示判定を1関数にまとめる。

**Architecture:** `lib/domain/account/navigation-visibility.ts` に `getNavigationChrome(pathname, isSignedIn)` を置き、`PrimaryNav`・`MobileEventFab`・新設の `BottomNavSpacer` がこれだけを見る（PR1）。未読件数は `app/layout.tsx` で1回数えて `PrimaryNav` に渡し、`AuthNav` からはベル・ログアウトを外す。ログアウトは設定画面のカードへ移す（PR2）。

**Tech Stack:** Next.js App Router（Server / Client Components）、Supabase（`@supabase/ssr`）、Tailwind CSS、lucide-react、Vitest + Testing Library

**設計doc:** `docs/superpowers/specs/2026-09-23-nav-redesign-design.md`

## Global Constraints

- 下部ナビの項目は順に「ホーム・イベント・カレンダー・つながり・通知」。スマホとPCで同じ項目
- 未読バッジは数字。100件以上は「99+」。通知リンクのアクセシブルな名前は「通知 未読N件」、0件なら「通知」
- ヘッダー右上はプロフィール設定済みなら「アバター＋設定」（`/settings`、`aria-label` は「設定（ニックネーム）」）、未設定なら今と同じ「プロフィール設定」（`/onboarding/profile`）
- ログアウトは設定画面の「退会」カードのすぐ上
- 未読件数が取れないときはバッジを出さず、画面は通常どおり描く
- 配色・角丸は `design/tokens.css` と既存クラス（`bg-clay`、`bg-mist`、`border-moss`、`text-pine`、`rounded-control`）に合わせる
- テストは `--reporter=dot` で流す（既定レポーターは出力が長い）

## 進め方

- PRは2本。PR1（Task 1）をマージしてから、PR2（Task 2・3）を main から切る。PR1 が未マージのまま進めるときは PR1 のブランチから切る
- 各PRの中は「REDをまとめて書く → 失敗を確認 → 実装をCodexに1回で委譲 → 差分を読んで検証・コミット」の順。RED確認・テスト実行・コミットはClaude側
- 各PRの最後に「PR前の確認」を行う

---

## PR1: 表示判定の統合（ブランチ `refactor/nav-chrome`）

### Task 1: `getNavigationChrome` と `BottomNavSpacer`

**Files:**
- Modify: `lib/domain/account/navigation-visibility.ts`
- Modify: `components/layout/primary-nav.tsx`
- Modify: `components/layout/mobile-event-fab.tsx`
- Create: `components/layout/bottom-nav-spacer.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/account/navigation-visibility.test.ts`（追記）
- Test: `tests/layout/bottom-nav-spacer.test.tsx`（新規）
- Test: `tests/layout/layout-responsive.test.tsx`（更新）

**Interfaces:**
- Produces:
  - `export type NavigationChrome = { primaryNav: boolean; createFab: boolean; bottomInset: boolean }`
  - `export function getNavigationChrome(pathname: string, isSignedIn: boolean): NavigationChrome`
  - `export function BottomNavSpacer({ isSignedIn }: { isSignedIn: boolean }): JSX.Element | null`
- `shouldShowPrimaryNavigation` はシグネチャを変えずに残す（`tests/layout/focused-page-back-link.test.ts` が使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/account/navigation-visibility.test.ts` の import を差し替え、末尾に追記する。

```ts
import { getNavigationChrome, shouldShowPrimaryNavigation } from "@/lib/domain/account/navigation-visibility";
```

```ts
describe("getNavigationChrome", () => {
  const none = { primaryNav: false, createFab: false, bottomInset: false };

  it("shows nothing to signed-out visitors", () => {
    expect(getNavigationChrome("/events", false)).toEqual(none);
  });

  it.each(["/events", "/plans"])("shows the navigation, the create button and the inset on %s", (pathname) => {
    expect(getNavigationChrome(pathname, true)).toEqual({ primaryNav: true, createFab: true, bottomInset: true });
  });

  it.each(["/", "/events/event-1", "/plans/plan-1", "/connections", "/notifications", "/settings"])(
    "shows the navigation and the inset without the create button on %s",
    (pathname) => {
      expect(getNavigationChrome(pathname, true)).toEqual({ primaryNav: true, createFab: false, bottomInset: true });
    }
  );

  it.each(["/events/new", "/plans/plan-1/confirm", "/s/token/settlement", "/onboarding/profile", "/login"])(
    "shows nothing on %s, where the navigation is hidden",
    (pathname) => {
      expect(getNavigationChrome(pathname, true)).toEqual(none);
    }
  );
});
```

`tests/layout/bottom-nav-spacer.test.tsx` を新規作成する。

```tsx
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import { BottomNavSpacer } from "@/components/layout/bottom-nav-spacer";

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: vi.fn()
}));

describe("BottomNavSpacer", () => {
  it("reserves mobile-only room under the footer where the fixed navigation is shown", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    const { container } = render(<BottomNavSpacer isSignedIn />);

    const spacer = container.querySelector('[data-testid="bottom-nav-spacer"]');
    expect(spacer).toHaveClass("h-36", "sm:hidden");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["/events/new", "/s/token/answer"])("renders nothing on %s, where the navigation is hidden", (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    const { container } = render(<BottomNavSpacer isSignedIn />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for signed-out visitors", () => {
    vi.mocked(usePathname).mockReturnValue("/events");

    const { container } = render(<BottomNavSpacer isSignedIn={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

`tests/layout/layout-responsive.test.tsx` を更新する。

`vi.hoisted` の `mocks` に `bottomNavSpacer: vi.fn()` を足し、`primary-nav` のモックの下に次を足す。

```tsx
vi.mock("@/components/layout/bottom-nav-spacer", () => ({
  BottomNavSpacer: (props: unknown) => {
    mocks.bottomNavSpacer(props);
    return <div data-mock="bottom-nav-spacer" />;
  }
}));
```

「gets authentication once…」のテストの末尾に1行足す。

```tsx
    expect(mocks.bottomNavSpacer).toHaveBeenCalledWith({ isSignedIn: true });
```

最後のテスト「keeps body content and the footer clear of the fixed mobile navigation」を、次のテストに置き換える。

```tsx
  it("leaves the fixed-navigation clearance to BottomNavSpacer instead of padding every page", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const document = new DOMParser().parseFromString(renderToStaticMarkup(layout), "text/html");

    const mainWrapperClasses = document.querySelector("main")?.parentElement?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainWrapperClasses).toContain("pb-10");
    expect(mainWrapperClasses).not.toContain("pb-36");

    const footer = document.querySelector("footer");
    const footerClasses = footer?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(footerClasses).toContain("pb-8");
    expect(footerClasses).not.toContain("pb-36");
    expect(footer?.nextElementSibling?.getAttribute("data-mock")).toBe("bottom-nav-spacer");
  });
```

- [ ] **Step 2: REDを確認する**

Run: `npx vitest run tests/account/navigation-visibility.test.ts tests/layout/bottom-nav-spacer.test.tsx tests/layout/layout-responsive.test.tsx --reporter=dot`
Expected: FAIL。`getNavigationChrome` が export されていない、`@/components/layout/bottom-nav-spacer` が見つからない、`pb-36` が残っている、の3種類。

- [ ] **Step 3: 実装する（Codexへ委譲）**

`lib/domain/account/navigation-visibility.ts` の末尾に追記する。

```ts
export type NavigationChrome = {
  /** 下部ナビ（PCではヘッダー下のナビ行） */
  primaryNav: boolean;
  /** イベント作成ボタン（FAB）。一覧系の画面だけに出す */
  createFab: boolean;
  /** スマホで固定ナビとFABに本文が隠れないための下余白 */
  bottomInset: boolean;
};

const createFabPaths = new Set(["/events", "/plans"]);

/** 画面ごとに、ナビまわりの部品を出すかどうかをまとめて決める。部品側はこれだけを見る。 */
export function getNavigationChrome(pathname: string, isSignedIn: boolean): NavigationChrome {
  const primaryNav = isSignedIn && shouldShowPrimaryNavigation(pathname);

  return {
    primaryNav,
    createFab: primaryNav && createFabPaths.has(pathname),
    bottomInset: primaryNav
  };
}
```

`components/layout/primary-nav.tsx`:

```tsx
import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";
```

```tsx
export function PrimaryNav({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).primaryNav) return null;
```

ファイル冒頭のdocコメントの「表示するパスの判定は lib/navigation-visibility.ts に切り出し」を「表示するかどうかは getNavigationChrome（lib/domain/account/navigation-visibility.ts）で決め」に直す。

`components/layout/mobile-event-fab.tsx`: `isFabVisiblePath` を消し、判定を差し替える。docコメントの「一覧系の画面だけに出す。…」以下の説明は残す。

```tsx
import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";
```

```tsx
export function MobileEventFab({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).createFab) return null;
```

`components/layout/bottom-nav-spacer.tsx` を新規作成する。

```tsx
"use client";

import { usePathname } from "next/navigation";
import React from "react";

import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";

/**
 * スマホの固定下部ナビとFABに、フッターの末尾が隠れないための空き。
 * ナビを出す画面にだけ置き、作成・編集などの集中画面では余分な空白を作らない。
 */
export function BottomNavSpacer({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).bottomInset) return null;

  return <div aria-hidden="true" data-testid="bottom-nav-spacer" className="h-36 sm:hidden" />;
}
```

`app/layout.tsx`:

```tsx
import { BottomNavSpacer } from "@/components/layout/bottom-nav-spacer";
```

- 本文ラッパーの `pb-36 ... sm:pb-10` を `pb-10` にする（`px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8 xl:px-10`）
- フッターの `pb-36 ... sm:pb-8` を `pb-8` にする（`px-4 pb-8 text-body text-muted sm:px-6 lg:px-8 xl:px-10`）
- `</footer>` の直後、`<MobileEventFab …/>` の前に `<BottomNavSpacer isSignedIn={isSignedIn} />` を置く

- [ ] **Step 4: GREENを確認する**

Run: `npx vitest run tests/account/navigation-visibility.test.ts tests/layout/bottom-nav-spacer.test.tsx tests/layout/layout-responsive.test.tsx tests/layout/primary-nav.test.tsx tests/layout/mobile-event-fab.test.tsx tests/layout/focused-page-back-link.test.ts --reporter=dot`
Expected: PASS（既存の `PrimaryNav`・`MobileEventFab` のテストも変更なしで通る）

- [ ] **Step 5: コミット**

```bash
git add lib/domain/account/navigation-visibility.ts components/layout/primary-nav.tsx components/layout/mobile-event-fab.tsx components/layout/bottom-nav-spacer.tsx app/layout.tsx tests/account/navigation-visibility.test.ts tests/layout/bottom-nav-spacer.test.tsx tests/layout/layout-responsive.test.tsx
git commit -m "refactor(nav): 下部ナビ・FAB・下余白の表示判定をgetNavigationChromeにまとめる"
```

### PR1 前の確認

- [ ] `npm run typecheck`、`npm run lint`、`npx vitest run --reporter=dot`、`npm run build` がすべて通る
- [ ] visual-qa（スマホ375px・PC）: `/events` でフッターが下部ナビとFABに隠れない。`/events/new` と `/s/<token>/answer` で下に余分な空白が無い。PCでは下余白が出ない
- [ ] Codexレビュー（Sol / high、`codex-delegation` のレビュー手順）。指摘は裏取りしてから直す
- [ ] PRを作成し、マージ前に内容を1〜2行で要約して承認を得る

---

## PR2: 通知を下部ナビへ、右上を「設定」に（ブランチ `feat/nav-notifications`）

### Task 2: 未読件数と5項目の下部ナビ

**Files:**
- Create: `lib/supabase/notification-count.ts`
- Modify: `app/layout.tsx`
- Modify: `components/layout/primary-nav.tsx`
- Modify: `design/rules.md:154`
- Test: `tests/notification/unread-notification-count.test.ts`（新規）
- Test: `tests/layout/primary-nav.test.tsx`（更新）
- Test: `tests/layout/layout-responsive.test.tsx`（更新）

**Interfaces:**
- Consumes: `getNavigationChrome`（Task 1）
- Produces:
  - `export async function getUnreadNotificationCount(userId: string): Promise<number | null>`
  - `PrimaryNav({ isSignedIn, unreadCount }: { isSignedIn: boolean; unreadCount?: number })`（`unreadCount` の既定は 0）

- [ ] **Step 1: 失敗するテストを書く**

`tests/notification/unread-notification-count.test.ts` を新規作成する。

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { getUnreadNotificationCount } from "@/lib/supabase/notification-count";

function mockNotificationQuery(result: { count: number | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue(result)
  };
  const from = vi.fn().mockReturnValue(query);
  createSupabaseServerClient.mockResolvedValue({ from });
  return { from, query };
}

describe("getUnreadNotificationCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts the signed-in user's unread notifications without fetching rows", async () => {
    const { from, query } = mockNotificationQuery({ count: 3, error: null });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBe(3);
    expect(from).toHaveBeenCalledWith("notifications");
    expect(query.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.is).toHaveBeenCalledWith("read_at", null);
  });

  it("returns 0 when the count comes back empty", async () => {
    mockNotificationQuery({ count: null, error: null });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBe(0);
  });

  it("returns null when the query fails, so the badge is simply left out", async () => {
    mockNotificationQuery({ count: null, error: { message: "boom" } });

    await expect(getUnreadNotificationCount("user-1")).resolves.toBeNull();
  });
});
```

`tests/layout/primary-nav.test.tsx` を更新する。

先頭のテストを次に置き換える。

```tsx
  it("shows the five primary destinations as icon buttons in a fixed mobile bar and a static desktop row", () => {
    render(<PrimaryNav isSignedIn />);

    const nav = screen.getByRole("navigation", { name: "主要な画面" });
    expect(nav).toHaveClass("fixed", "bottom-0", "grid-cols-5", "sm:static", "sm:grid-cols-5");

    const destinations = [
      ["ホーム", "/"],
      ["イベント", "/events"],
      ["カレンダー", "/plans"],
      ["つながり", "/connections"],
      ["通知", "/notifications"]
    ] as const;

    for (const [name, href] of destinations) {
      const link = within(nav).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("min-h-14", "rounded-control", "sm:min-h-11", "sm:border");
      expect(link.querySelector("svg")).toBeInTheDocument();
    }
  });
```

`describe` の末尾に追記する。

```tsx
  it("puts the unread count on the notifications destination", () => {
    render(<PrimaryNav isSignedIn unreadCount={3} />);

    const link = screen.getByRole("link", { name: "通知 未読3件" });
    expect(link).toHaveAttribute("href", "/notifications");
    expect(within(link).getByText("3")).toHaveClass("bg-clay", "text-white");
  });

  it("caps the badge at 99+ while the accessible name keeps the exact count", () => {
    render(<PrimaryNav isSignedIn unreadCount={150} />);

    const link = screen.getByRole("link", { name: "通知 未読150件" });
    expect(within(link).getByText("99+")).toBeInTheDocument();
  });

  it("shows no badge when everything is read", () => {
    render(<PrimaryNav isSignedIn unreadCount={0} />);

    const link = screen.getByRole("link", { name: "通知" });
    expect(link.querySelector(".bg-clay")).not.toBeInTheDocument();
  });

  it("marks notifications as the current destination on the notifications page", () => {
    navigation.pathname = "/notifications";
    render(<PrimaryNav isSignedIn />);

    expect(screen.getByRole("link", { name: "通知" })).toHaveAttribute("aria-current", "page");
  });
```

`tests/layout/layout-responsive.test.tsx` を更新する。

`mocks` に `getUnreadNotificationCount: vi.fn()` を足し、モックを追加する。

```tsx
vi.mock("@/lib/supabase/notification-count", () => ({
  getUnreadNotificationCount: mocks.getUnreadNotificationCount
}));
```

`beforeEach` に `mocks.getUnreadNotificationCount.mockResolvedValue(3);` を足す。
「gets authentication once…」の `expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: true });` を次に置き換える。

```tsx
    expect(mocks.getUnreadNotificationCount).toHaveBeenCalledWith("user-1");
    expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: true, unreadCount: 3 });
```

`describe` の末尾に追記する。

```tsx
  it("does not count notifications for signed-out visitors", async () => {
    vi.stubGlobal("React", React);
    mocks.getCurrentUser.mockResolvedValue(null);

    renderToStaticMarkup(await RootLayout({ children: "本文" }));

    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
    expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: false, unreadCount: 0 });
  });

  it("still renders the navigation without a badge when the count cannot be read", async () => {
    vi.stubGlobal("React", React);
    mocks.getUnreadNotificationCount.mockResolvedValue(null);

    renderToStaticMarkup(await RootLayout({ children: "本文" }));

    expect(mocks.primaryNav).toHaveBeenCalledWith({ isSignedIn: true, unreadCount: 0 });
  });
```

- [ ] **Step 2: REDを確認する**

Run: `npx vitest run tests/notification/unread-notification-count.test.ts tests/layout/primary-nav.test.tsx tests/layout/layout-responsive.test.tsx --reporter=dot`
Expected: FAIL。`@/lib/supabase/notification-count` が見つからない、`grid-cols-5` と「通知」リンクが無い、`unreadCount` が渡っていない。

- [ ] **Step 3: 実装する（Task 3 とまとめてCodexへ委譲）**

`lib/supabase/notification-count.ts` を新規作成する。

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 未読通知の件数。行は取らず件数だけを数える。
 * 取れなかったときは null を返し、呼び出し側はバッジを出さずに画面を描く。
 */
export async function getUnreadNotificationCount(userId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return null;
  return count ?? 0;
}
```

`app/layout.tsx`:

```tsx
import { getUnreadNotificationCount } from "@/lib/supabase/notification-count";
```

```tsx
  const isSignedIn = Boolean(user);
  const unreadNotificationCount = user ? await getUnreadNotificationCount(user.id) : null;
```

```tsx
            <PrimaryNav isSignedIn={isSignedIn} unreadCount={unreadNotificationCount ?? 0} />
```

`components/layout/primary-nav.tsx`（全体）:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Bell, CalendarDays, CalendarRange, House, UsersRound } from "lucide-react";

import { getNavigationChrome } from "@/lib/domain/account/navigation-visibility";

/**
 * スマホでは画面下部に固定し、PCではヘッダー直下の静的な行として表示する主要ナビ。
 * 表示するかどうかは getNavigationChrome（lib/domain/account/navigation-visibility.ts）で決め、集中操作画面では出さない。
 */
const items = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/events", label: "イベント", icon: CalendarDays },
  { href: "/plans", label: "カレンダー", icon: CalendarRange },
  { href: "/connections", label: "つながり", icon: UsersRound },
  { href: "/notifications", label: "通知", icon: Bell }
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function formatBadge(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function PrimaryNav({ isSignedIn, unreadCount = 0 }: { isSignedIn: boolean; unreadCount?: number }) {
  const pathname = usePathname();

  if (!getNavigationChrome(pathname, isSignedIn).primaryNav) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md sm:static sm:mb-5 sm:grid-cols-5 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
      aria-label="主要な画面"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const badge = item.href === "/notifications" && unreadCount > 0 ? formatBadge(unreadCount) : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${item.label} 未読${unreadCount}件` : undefined}
            className={clsx(
              "relative inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:min-h-11 sm:border sm:px-2 sm:text-body sm:shadow-raise",
              active ? "border-moss bg-mist text-pine" : "border-line bg-surface text-muted hover:text-pine"
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate">{item.label}</span>
            {badge ? (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-clay px-1.5 py-0.5 text-[11px] font-bold leading-none text-white sm:-right-1 sm:-top-1"
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
```

`design/rules.md:154` の「「ホーム」「イベント」「カレンダー」「つながり」4項目の下部固定ナビゲーション」を「「ホーム」「イベント」「カレンダー」「つながり」「通知」の5項目の下部固定ナビゲーション（通知は2026-09-23の設計 `docs/superpowers/specs/2026-09-23-nav-redesign-design.md` で追加）」に、`components/primary-nav.tsx` を `components/layout/primary-nav.tsx` に、`lib/navigation-visibility.ts` を `lib/domain/account/navigation-visibility.ts` に直す。

- [ ] **Step 4: GREENを確認する**

Run: `npx vitest run tests/notification/unread-notification-count.test.ts tests/layout/primary-nav.test.tsx tests/layout/layout-responsive.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/supabase/notification-count.ts app/layout.tsx components/layout/primary-nav.tsx design/rules.md tests/notification/unread-notification-count.test.ts tests/layout/primary-nav.test.tsx tests/layout/layout-responsive.test.tsx
git commit -m "feat(nav): 通知を下部ナビの5項目目に移し、未読バッジを付ける"
```

### Task 3: 右上を「アバター＋設定」に、ログアウトを設定画面へ

**Files:**
- Modify: `components/layout/auth-nav.tsx`
- Create: `components/account/sign-out-card.tsx`
- Modify: `app/settings/page.tsx`
- Test: `tests/account/auth-nav-profile.test.tsx`（更新）
- Test: `tests/account/sign-out-card.test.tsx`（新規）
- Test: `tests/account/settings-navigation-cleanup.test.ts`（追記）

**Interfaces:**
- Consumes: `signOutAction`（`lib/actions/account/auth.ts`、既存）
- Produces: `export function SignOutCard(): JSX.Element`

- [ ] **Step 1: 失敗するテストを書く**

`tests/account/auth-nav-profile.test.tsx` の import に `within` を足し、1つ目のテストの `render(await AuthNav({ user }));` 以降を置き換える。

```tsx
import { render, screen, within } from "@testing-library/react";
```

```tsx
    const from = vi.fn((table: string) => (table === "profiles" ? profileQuery : notificationQuery));
    createSupabaseServerClient.mockResolvedValue({ from });

    render(await AuthNav({ user }));

    const settingsLink = screen.getByRole("link", { name: "設定（ゆうやん）" });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(settingsLink).toHaveAttribute("title", "設定");
    expect(within(settingsLink).getByText("設定")).not.toHaveClass("hidden");
    expect(screen.getByRole("img", { name: "ゆうやんのプロフィール画像" })).toHaveAttribute(
      "src",
      "https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar.webp"
    );
    expect(screen.queryByRole("link", { name: /通知/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログアウト" })).not.toBeInTheDocument();
    expect(from).not.toHaveBeenCalledWith("notifications");
```

（既存の `createSupabaseServerClient.mockResolvedValue({ from: vi.fn(...) })` の行は上の2行に置き換える。テスト名は「shows a single settings entry with the avatar and no bell or sign-out」に変える。2つ目のテスト（未設定時）は変更しない。）

`tests/account/sign-out-card.test.tsx` を新規作成する。

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);
vi.mock("@/lib/actions/account/auth", () => ({ signOutAction: vi.fn() }));

import { SignOutCard } from "@/components/account/sign-out-card";

describe("SignOutCard", () => {
  it("offers sign-out as a submit button inside a form", () => {
    render(<SignOutCard />);

    expect(screen.getByRole("heading", { name: "ログアウト" })).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "ログアウト" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
    expect(button).toHaveClass("min-h-11", "focus:ring-2", "focus:ring-clay");
  });
});
```

`tests/account/settings-navigation-cleanup.test.ts` の `describe` に追記する。

```ts
  it("places sign-out just above the withdrawal card", () => {
    const page = readFileSync(resolve(process.cwd(), "app/settings/page.tsx"), "utf8");

    const signOut = page.indexOf("<SignOutCard />");
    const withdrawal = page.indexOf("退会の手続きへ");
    expect(signOut).toBeGreaterThan(-1);
    expect(signOut).toBeLessThan(withdrawal);
    expect(page.indexOf("<CalendarConnectionCard")).toBeLessThan(signOut);
  });
```

- [ ] **Step 2: REDを確認する**

Run: `npx vitest run tests/account/auth-nav-profile.test.tsx tests/account/sign-out-card.test.tsx tests/account/settings-navigation-cleanup.test.ts --reporter=dot`
Expected: FAIL。「設定（ゆうやん）」リンクが無い、`@/components/account/sign-out-card` が見つからない、設定画面に `<SignOutCard />` が無い。

- [ ] **Step 3: 実装する（Task 2 とまとめてCodexへ委譲）**

`components/layout/auth-nav.tsx`:

- import から `Bell`・`LogOut` と `signOutAction` を外す
- `Promise.all` をやめ、`profiles` だけを取る

```tsx
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, avatar_path, onboarding_completed_at")
    .eq("user_id", user!.id)
    .maybeSingle();
```

- `profileHref` を `profileCompleted ? "/settings" : "/onboarding/profile"` に、`profileLabel` を `profileCompleted ? "設定" : "プロフィール設定"` にする
- `return` の中身を次にする（ベルのリンクとログアウトのフォームは削除）

```tsx
  return (
    <div className="flex w-full items-center justify-end gap-1 text-sm sm:w-auto sm:gap-2">
      <Link
        href={profileHref}
        className={
          profileCompleted
            ? "flex h-11 min-w-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 font-bold text-pine shadow-soft transition-colors hover:border-moss hover:text-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            : "flex h-11 min-w-0 items-center justify-start gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-muted shadow-soft transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        }
        aria-label={profileCompleted ? `設定（${nickname}）` : "プロフィールを設定"}
        title={profileCompleted ? "設定" : "プロフィールを設定"}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={`${nickname}のプロフィール画像`}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UserRound aria-hidden="true" className="h-5 w-5 text-pine" />
        )}
        <span className="min-w-0 truncate font-bold sm:max-w-32">{profileLabel}</span>
      </Link>
    </div>
  );
```

`components/account/sign-out-card.tsx` を新規作成する。

```tsx
import React from "react";
import { LogOut } from "lucide-react";

import { Card } from "@/components/ui";
import { signOutAction } from "@/lib/actions/account/auth";

export function SignOutCard() {
  return (
    <Card className="max-w-2xl">
      <h2 className="text-title text-ink">ログアウト</h2>
      <p className="mt-1 text-caption text-muted">この端末からログアウトします。次に使うときは、もう一度Googleでログインしてください。</p>
      <form action={signOutAction} className="mt-4">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          ログアウト
        </button>
      </form>
    </Card>
  );
}
```

`app/settings/page.tsx`:

```tsx
import { SignOutCard } from "@/components/account/sign-out-card";
```

`<CalendarConnectionCard … />` の直後、「退会」の `<Card className="max-w-2xl">` の直前に `<SignOutCard />` を置く。

- [ ] **Step 4: GREENを確認する**

Run: `npx vitest run tests/account/auth-nav-profile.test.tsx tests/account/sign-out-card.test.tsx tests/account/settings-navigation-cleanup.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/layout/auth-nav.tsx components/account/sign-out-card.tsx app/settings/page.tsx tests/account/auth-nav-profile.test.tsx tests/account/sign-out-card.test.tsx tests/account/settings-navigation-cleanup.test.ts
git commit -m "feat(nav): 右上をアバター＋設定の1つにし、ログアウトを設定画面へ移す"
```

### PR2 前の確認

- [ ] `npm run typecheck`、`npm run lint`、`npx vitest run --reporter=dot`、`npm run build` がすべて通る
- [ ] `accessibility` スキルで、通知リンクの名前（未読あり・0件）、設定ボタンの名前、キーボードでのフォーカス移動を確認する
- [ ] visual-qa（スマホ375px・PC）: 未読ありと0件の両方で、ホーム・イベント一覧・通知・設定・作成画面を見る。見る箇所は、下部ナビ5項目のラベルが切れないこと、バッジの位置、右上の「アバター＋設定」、設定画面のログアウトの位置、`/notifications` で「通知」がアクティブになること
- [ ] Codexレビュー（Sol / high、`codex-delegation` のレビュー手順）。指摘は裏取りしてから直す
- [ ] PRを作成し、マージ前に内容を1〜2行で要約して承認を得る
