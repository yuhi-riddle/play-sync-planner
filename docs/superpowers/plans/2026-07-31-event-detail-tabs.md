# イベント詳細画面のタブ化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント詳細画面（`/events/[eventId]`）を4タブに分割し、開いているタブに必要なデータだけを取得する。

**Architecture:** タブ状態は `?tab=` で URL に持たせ、サーバーコンポーネントのまま `<Link>` で遷移する。タブ値のパース・進行状況の算出・タブごとに必要なデータの判定は、いずれも `lib/domain/` の純関数に切り出して単体テストする。ページ本体はその判定に従って条件付きでデータを取得する。

**Tech Stack:** Next.js 15 (App Router, force-dynamic), React 19, Supabase, Vitest + React Testing Library (jsdom), Tailwind CSS

## Global Constraints

- 設計の正は `docs/superpowers/specs/2026-07-31-event-detail-tabs-design.md`
- テストは `tests/` 直下にのみ置く（コロケーション不可）
- UI プリミティブは `components/ui.tsx` から import する（`ui-server.tsx` / `ui-client.tsx` を直接 import しない）
- jsdom では computed style が取れないため、見た目の検証はクラス名の存在で行う
- 設定ファイル・DBスキーマは変更しない
- 失敗したテストを削除・スキップして「解決」にしない
- 依頼と無関係なリファクタリング・整形をしない
- `vitest.setup.ts` で現在時刻は `2026-07-01T00:00:00+09:00` に固定されている
- 各タスクの最後にコミットする。push はしない

---

### Task 1: タブの定義・URLパース・必要データ判定

**Files:**
- Create: `lib/domain/event-tabs.ts`
- Test: `tests/event-tabs.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `EVENT_DETAIL_TABS: readonly ["overview", "members", "chat", "tasks"]`
  - `type EventDetailTab = "overview" | "members" | "chat" | "tasks"`
  - `EVENT_DETAIL_TAB_LABELS: Record<EventDetailTab, string>`
  - `normalizeEventDetailTab(value: string | string[] | undefined): EventDetailTab`
  - `resolveEventDetailDataNeeds(tab: EventDetailTab, isOwner: boolean): { needsInviteCandidates: boolean; needsChatMessages: boolean; needsTasks: boolean }`

- [ ] **Step 1: Write the failing test**

`tests/event-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  EVENT_DETAIL_TABS,
  EVENT_DETAIL_TAB_LABELS,
  normalizeEventDetailTab,
  resolveEventDetailDataNeeds
} from "@/lib/domain/event-tabs";

describe("normalizeEventDetailTab", () => {
  it("未指定なら概要にする", () => {
    expect(normalizeEventDetailTab(undefined)).toBe("overview");
  });

  it("知らない値なら概要にする", () => {
    expect(normalizeEventDetailTab("settlement")).toBe("overview");
  });

  it("正しい値はそのまま通す", () => {
    expect(normalizeEventDetailTab("chat")).toBe("chat");
    expect(normalizeEventDetailTab("members")).toBe("members");
    expect(normalizeEventDetailTab("tasks")).toBe("tasks");
  });

  it("同じキーが複数回来たときは最初の値を見る", () => {
    expect(normalizeEventDetailTab(["tasks", "chat"])).toBe("tasks");
  });

  it("空配列なら概要にする", () => {
    expect(normalizeEventDetailTab([])).toBe("overview");
  });
});

describe("EVENT_DETAIL_TAB_LABELS", () => {
  it("すべてのタブに日本語ラベルがある", () => {
    for (const tab of EVENT_DETAIL_TABS) {
      expect(EVENT_DETAIL_TAB_LABELS[tab]).toBeTruthy();
    }
  });
});

describe("resolveEventDetailDataNeeds", () => {
  // 概要タブで重いデータを取りに行かないことが、今回の速度改善の核心。
  it("概要タブでは追加のデータを取らない", () => {
    expect(resolveEventDetailDataNeeds("overview", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: false,
      needsTasks: false
    });
  });

  it("チャットタブではメッセージだけ取る", () => {
    expect(resolveEventDetailDataNeeds("chat", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: true,
      needsTasks: false
    });
  });

  it("タスクタブではタスクだけ取る", () => {
    expect(resolveEventDetailDataNeeds("tasks", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: false,
      needsTasks: true
    });
  });

  it("参加者タブでは、オーナーのときだけ招待候補を取る", () => {
    expect(resolveEventDetailDataNeeds("members", true).needsInviteCandidates).toBe(true);
    expect(resolveEventDetailDataNeeds("members", false).needsInviteCandidates).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-tabs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/event-tabs"`

- [ ] **Step 3: Write minimal implementation**

`lib/domain/event-tabs.ts`:

```ts
export const EVENT_DETAIL_TABS = ["overview", "members", "chat", "tasks"] as const;

export type EventDetailTab = (typeof EVENT_DETAIL_TABS)[number];

export const EVENT_DETAIL_TAB_LABELS: Record<EventDetailTab, string> = {
  overview: "概要",
  members: "参加者",
  chat: "チャット",
  tasks: "タスク"
};

export function normalizeEventDetailTab(value: string | string[] | undefined): EventDetailTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return EVENT_DETAIL_TABS.includes(candidate as EventDetailTab) ? (candidate as EventDetailTab) : "overview";
}

/**
 * 開いているタブに応じて、追加で取得すべきデータを決める。
 * イベント本体・参加人数・招待リンク・参加者かどうかの判定は常に必要なのでここには含めない。
 */
export function resolveEventDetailDataNeeds(
  tab: EventDetailTab,
  isOwner: boolean
): { needsInviteCandidates: boolean; needsChatMessages: boolean; needsTasks: boolean } {
  return {
    needsInviteCandidates: tab === "members" && isOwner,
    needsChatMessages: tab === "chat",
    needsTasks: tab === "tasks"
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event-tabs.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/domain/event-tabs.ts tests/event-tabs.test.ts
git commit -m "feat: add event detail tab definitions and data-need resolution"
```

---

### Task 2: 進行状況サマリーの算出

**Files:**
- Create: `lib/domain/event-progress.ts`
- Test: `tests/event-progress.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type EventProgressPlan = { status: string; confirmed_start_at: string | null; answer_deadline_at: string | null }`
  - `type EventProgress = { statusLabel: string; highlightLabel: string | null; highlightAt: string | null }`
  - `resolveEventProgress(eventStatus: string, plans: EventProgressPlan[]): EventProgress`

- [ ] **Step 1: Write the failing test**

`tests/event-progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveEventProgress } from "@/lib/domain/event-progress";

describe("resolveEventProgress", () => {
  it("日程調整がなければ参加者募集中", () => {
    expect(resolveEventProgress("open", [])).toEqual({
      statusLabel: "参加者募集中",
      highlightLabel: null,
      highlightAt: null
    });
  });

  it("日程調整があれば日程調整中になり、回答期限を出す", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.statusLabel).toBe("日程調整中");
    expect(progress.highlightLabel).toBe("回答期限");
    expect(progress.highlightAt).toBe("2026-07-20T03:00:00Z");
  });

  it("確定していれば確定になり、開催日時を出す", () => {
    const progress = resolveEventProgress("confirmed", [
      { status: "confirmed", confirmed_start_at: "2026-07-25T09:00:00Z", answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.statusLabel).toBe("確定");
    expect(progress.highlightLabel).toBe("開催日時");
    expect(progress.highlightAt).toBe("2026-07-25T09:00:00Z");
  });

  it("日程調整が複数あるときは、確定済みの開催日時を優先する", () => {
    const progress = resolveEventProgress("confirmed", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-18T03:00:00Z" },
      { status: "confirmed", confirmed_start_at: "2026-07-25T09:00:00Z", answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.highlightLabel).toBe("開催日時");
    expect(progress.highlightAt).toBe("2026-07-25T09:00:00Z");
  });

  it("確定がなければ、回答期限が最も早いものを出す", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-22T03:00:00Z" },
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-18T03:00:00Z" }
    ]);

    expect(progress.highlightAt).toBe("2026-07-18T03:00:00Z");
  });

  it("確定も回答期限もなければ日時を出さない", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: null }
    ]);

    expect(progress.statusLabel).toBe("日程調整中");
    expect(progress.highlightLabel).toBeNull();
    expect(progress.highlightAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-progress.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain/event-progress"`

- [ ] **Step 3: Write minimal implementation**

`lib/domain/event-progress.ts`:

```ts
export type EventProgressPlan = {
  status: string;
  confirmed_start_at: string | null;
  answer_deadline_at: string | null;
};

export type EventProgress = {
  statusLabel: string;
  highlightLabel: string | null;
  highlightAt: string | null;
};

/**
 * イベント名の下に出す進行状況の要約を決める。
 * 状態の判定はタブ化前の画面と同じ規則をそのまま使う。
 */
export function resolveEventProgress(eventStatus: string, plans: EventProgressPlan[]): EventProgress {
  const statusLabel = eventStatus === "confirmed" ? "確定" : plans.length > 0 ? "日程調整中" : "参加者募集中";

  const confirmedStarts = plans
    .map((plan) => plan.confirmed_start_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (confirmedStarts.length > 0) {
    return { statusLabel, highlightLabel: "開催日時", highlightAt: confirmedStarts[0] };
  }

  const deadlines = plans
    .map((plan) => plan.answer_deadline_at)
    .filter((value): value is string => Boolean(value))
    .sort();

  if (deadlines.length > 0) {
    return { statusLabel, highlightLabel: "回答期限", highlightAt: deadlines[0] };
  }

  return { statusLabel, highlightLabel: null, highlightAt: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event-progress.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/domain/event-progress.ts tests/event-progress.test.ts
git commit -m "feat: add event progress summary resolution"
```

---

### Task 3: タブバーコンポーネント

**Files:**
- Create: `components/event-detail-tabs.tsx`
- Test: `tests/event-detail-tabs.test.tsx`

**Interfaces:**
- Consumes: `EVENT_DETAIL_TABS`, `EVENT_DETAIL_TAB_LABELS`, `EventDetailTab`（Task 1）
- Produces: `EventDetailTabs({ eventId, active }: { eventId: string; active: EventDetailTab })`

概要タブへのリンクは `?tab=` を付けず `/events/{eventId}` にする。他は `/events/{eventId}?tab={tab}`。

- [ ] **Step 1: Write the failing test**

`tests/event-detail-tabs.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EventDetailTabs } from "@/components/event-detail-tabs";

describe("EventDetailTabs", () => {
  it("4つのタブを出す", () => {
    render(<EventDetailTabs eventId="event-1" active="overview" />);

    expect(screen.getByRole("link", { name: "概要" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "参加者" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "チャット" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "タスク" })).toBeInTheDocument();
  });

  it("概要タブのリンクにはクエリを付けない", () => {
    render(<EventDetailTabs eventId="event-1" active="chat" />);

    expect(screen.getByRole("link", { name: "概要" })).toHaveAttribute("href", "/events/event-1");
  });

  it("概要以外のタブはクエリ付きのリンクになる", () => {
    render(<EventDetailTabs eventId="event-1" active="overview" />);

    expect(screen.getByRole("link", { name: "チャット" })).toHaveAttribute("href", "/events/event-1?tab=chat");
    expect(screen.getByRole("link", { name: "タスク" })).toHaveAttribute("href", "/events/event-1?tab=tasks");
    expect(screen.getByRole("link", { name: "参加者" })).toHaveAttribute("href", "/events/event-1?tab=members");
  });

  it("開いているタブが分かるようにする", () => {
    render(<EventDetailTabs eventId="event-1" active="chat" />);

    expect(screen.getByRole("link", { name: "チャット" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "概要" })).not.toHaveAttribute("aria-current");
  });

  // middleware が全リクエストで Supabase に2往復するため、4タブ分を先読みすると
  // タブ化で減らした往復を食い潰す。prefetch は明示的に切る。
  it("タブのリンクは先読みしない", () => {
    const source = readFileSync(path.join(process.cwd(), "components/event-detail-tabs.tsx"), "utf8");

    expect(source).toContain("prefetch={false}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-detail-tabs.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/event-detail-tabs"`

- [ ] **Step 3: Write minimal implementation**

`components/event-detail-tabs.tsx`:

```tsx
import Link from "next/link";

import { EVENT_DETAIL_TABS, EVENT_DETAIL_TAB_LABELS, type EventDetailTab } from "@/lib/domain/event-tabs";

export function EventDetailTabs({ eventId, active }: { eventId: string; active: EventDetailTab }) {
  return (
    <nav aria-label="イベントの表示切り替え" className="border-b border-line">
      <ul className="flex">
        {EVENT_DETAIL_TABS.map((tab) => {
          const isActive = tab === active;

          return (
            <li key={tab} className="flex-1">
              <Link
                href={tab === "overview" ? `/events/${eventId}` : `/events/${eventId}?tab=${tab}`}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center border-b-2 px-2 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${
                  isActive ? "border-ink font-bold text-ink" : "border-transparent text-muted hover:text-pine"
                }`}
              >
                {EVENT_DETAIL_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event-detail-tabs.test.tsx`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add components/event-detail-tabs.tsx tests/event-detail-tabs.test.tsx
git commit -m "feat: add the event detail tab bar"
```

---

### Task 4: ページをタブ構成に組み替える（データ取得は現状のまま）

このタスクでは表示だけを変える。データ取得の削減は Task 5 で行う。ここで一度動く状態にしておくことで、表示の崩れと取得の変更を切り分けてレビューできる。

**Files:**
- Modify: `components/ui-server.tsx:14-36`（`PageHeader` に `summary?: ReactNode` を追加）
- Modify: `app/events/[eventId]/page.tsx:68-217`（`searchParams` の受け取り、ヘッダー要約、タブでの出し分け）
- Test: `tests/event-detail-tabs-layout.test.ts`

**Interfaces:**
- Consumes: `normalizeEventDetailTab`, `EventDetailTab`（Task 1）、`resolveEventProgress`（Task 2）、`EventDetailTabs`（Task 3）
- Produces: なし（ページの内部構造のみ）

**このタスク中に出てくる行番号は、すべて Task 4 に着手する前の `page.tsx` のもの。** 編集を進めると番号がずれるので、行番号ではなくコンポーネント名（`<EventChat`、`<EventTaskList` など）を目印に探すこと。

- [ ] **Step 1: Write the failing test**

サーバーコンポーネント（async）は jsdom で直接レンダリングできないため、ページの構造はソースの静的検証で確認する。`tests/next-config.test.ts` と同じ方針。

`tests/event-detail-tabs-layout.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/events/[eventId]/page.tsx"), "utf8");

describe("イベント詳細ページのタブ構成", () => {
  it("searchParams からタブを受け取る", () => {
    expect(source).toContain("searchParams");
    expect(source).toContain("normalizeEventDetailTab");
  });

  it("タブバーを描画する", () => {
    expect(source).toContain("<EventDetailTabs");
  });

  it("進行状況の要約をヘッダーに出す", () => {
    expect(source).toContain("resolveEventProgress");
  });

  it("チャットとタスクはそれぞれのタブでのみ描画する", () => {
    expect(source).toMatch(/tab === "chat"[\s\S]*<EventChat/);
    expect(source).toMatch(/tab === "tasks"[\s\S]*<EventTaskList/);
  });

  it("招待まわりは参加者タブでのみ描画する", () => {
    expect(source).toMatch(/tab === "members"[\s\S]*<EventMemberInviteCard/);
    expect(source).toMatch(/tab === "members"[\s\S]*<EventInviteCandidates/);
  });

  it("日程調整の一覧は概要タブに置く", () => {
    expect(source).toMatch(/tab === "overview"[\s\S]*日程調整/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-detail-tabs-layout.test.ts`
Expected: FAIL — `expected '...' to contain 'normalizeEventDetailTab'`

- [ ] **Step 3: Write minimal implementation**

まず `components/ui-server.tsx` の `PageHeader` に `summary` を足す。既存の呼び出しには影響しない任意の props とする。

```tsx
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  summary
}: {
  title: string;
  description?: string;
  /** 画面のカテゴリ。省略するとブランド名になるが、原則として画面ごとの語を渡す */
  eyebrow?: string;
  action?: ReactNode;
  /** タイトルの下に出す状態の要約。バッジなどを渡す */
  summary?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-eyebrow uppercase text-pine">{eyebrow ?? brand.shortName}</p>
        <h1 className="mt-2 break-words text-display text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-body text-muted">{description}</p> : null}
        {summary ? <div className="mt-3">{summary}</div> : null}
      </div>
      {action}
    </div>
  );
}
```

次に `app/events/[eventId]/page.tsx` を組み替える。

import に追加する行:

```tsx
import { EventDetailTabs } from "@/components/event-detail-tabs";
import { normalizeEventDetailTab } from "@/lib/domain/event-tabs";
import { resolveEventProgress } from "@/lib/domain/event-progress";
```

関数シグネチャを変更する（68行目）:

```tsx
export default async function EventDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const { eventId } = await params;
  const tab = normalizeEventDetailTab((await searchParams)?.tab);
```

`return` の中身（104-216行）を次の構造に置き換える。既存の各ブロックの中身はそのまま移動させ、囲む条件だけを変える。

```tsx
  const progress = resolveEventProgress(event.status, (event.plans ?? []) as EventPlan[]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event"
        title={event.title}
        action={isOwner && canStartAdjustment ? <ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink> : null}
        summary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="rounded-full border border-line px-3 py-1 font-bold text-pine">{progress.statusLabel}</span>
            <span className="text-muted">参加者 {memberCount ?? 0}人</span>
            {progress.highlightAt ? (
              <span className="text-muted">
                {progress.highlightLabel} {formatDateTime(progress.highlightAt)}
              </span>
            ) : null}
          </div>
        }
      />

      <EventDetailTabs eventId={event.id} active={tab} />

      {tab === "overview" ? (
        <>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-ink">日程調整</h2>
            {/* 既存の日程調整一覧ブロック（193-211行）の中身をそのまま移す */}
          </section>

          <Card>
            {/* 既存のイベント情報カード（112-142行）の中身をそのまま移す */}
          </Card>
        </>
      ) : null}

      {tab === "members" ? (
        <>
          {isOwner ? (
            <Card>
              {/* 既存の EventMemberInviteCard ブロック（145-153行）をそのまま移す */}
            </Card>
          ) : (
            <Card>
              {/* 既存の参加者人数ブロック（155-163行）をそのまま移す */}
            </Card>
          )}

          {isOwner ? (
            <Card>
              {/* 既存の EventInviteCandidates ブロック（167-169行）をそのまま移す */}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === "chat" ? (
        <Card>
          {/* 既存の EventChat ブロック（184-191行）をそのまま移す */}
        </Card>
      ) : null}

      {tab === "tasks" ? (
        <Card>
          {/* 既存の EventTaskList ブロック（172-182行）をそのまま移す */}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SecondaryLink href="/events">イベント一覧へ</SecondaryLink>
      </div>
    </div>
  );
```

注意点:

- 上のコード中の `{/* … */}` は、既存ブロックの**中身をそのまま移す**という指示である。プレースホルダのまま残さず、必ず現在のコードを移植すること
- `PageHeader` の `description`（「イベントの基本情報、参加者、日程調整をここで管理します。」）は削る。タブが増えて説明が冗長になるため
- 進行状況は `Info label="進行状況"` としてイベント情報カードにも出ていたが、ヘッダーに移すのでカードからは**削除**する。カテゴリ・場所メモ・URL・メモの4項目は残す

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/event-detail-tabs-layout.test.ts`
Expected: PASS（6 tests）

Run: `npm test`
Expected: 全通過

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add components/ui-server.tsx "app/events/[eventId]/page.tsx" tests/event-detail-tabs-layout.test.ts
git commit -m "feat: split the event detail page into tabs"
```

---

### Task 5: データ取得をタブごとに分割する

**Files:**
- Modify: `app/events/[eventId]/page.tsx:81-100`（取得の波）と `252-300`（`loadEventChat` の分割）
- Test: `tests/event-detail-data-loading.test.ts`

**Interfaces:**
- Consumes: `resolveEventDetailDataNeeds`（Task 1）
- Produces:
  - `loadEventMembership(eventId: string, currentUserId: string): Promise<boolean>` — 自分が参加者かどうかだけを判定する
  - `loadEventChatMessages(eventId: string, currentUserId: string): Promise<EventMessage[]>` — メッセージのみを取得する

現在の `loadEventChat` は「参加判定 → メッセージ取得 → 投稿者名の解決」を3本直列で行う。前者は常に必要、後ろ2本はチャットタブでのみ必要なので分割する。

- [ ] **Step 1: Write the failing test**

`tests/event-detail-data-loading.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/events/[eventId]/page.tsx"), "utf8");

describe("イベント詳細ページのデータ取得", () => {
  it("タブごとの必要データ判定を使う", () => {
    expect(source).toContain("resolveEventDetailDataNeeds");
  });

  it("参加判定とメッセージ取得が別の関数に分かれている", () => {
    expect(source).toContain("async function loadEventMembership");
    expect(source).toContain("async function loadEventChatMessages");
  });

  // 分割前は loadEventChat が参加判定とメッセージ取得を必ずまとめて実行していた。
  // 概要タブでメッセージを取りに行かないことが、このタスクの目的そのもの。
  it("参加判定とメッセージ取得をまとめて行う関数が残っていない", () => {
    expect(source).not.toContain("async function loadEventChat(");
  });

  it("メッセージ・タスク・招待候補は必要判定を通してから取得する", () => {
    expect(source).toMatch(/needsChatMessages\s*\?/);
    expect(source).toMatch(/needsTasks\s*\?/);
    expect(source).toMatch(/needsInviteCandidates\s*\?/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-detail-data-loading.test.ts`
Expected: FAIL — `expected '...' to contain 'resolveEventDetailDataNeeds'`

- [ ] **Step 3: Write minimal implementation**

`loadEventChat` を2つに分割する。`loadEventChat` 自体は削除する。

```tsx
async function loadEventMembership(eventId: string, currentUserId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: membership, error } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", currentUserId)
    .eq("status", "joined")
    .maybeSingle();

  if (error) {
    throw new Error("チャットの参加状態を確認できませんでした");
  }

  return Boolean(membership);
}

async function loadEventChatMessages(eventId: string, currentUserId: string): Promise<EventMessage[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error: messagesError } = await admin
    .from("event_messages")
    .select("id, author_user_id, body, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (messagesError) {
    throw new Error("チャットを読み込めませんでした");
  }

  const messages = (rows ?? []) as EventMessageRow[];
  const authorIds = [...new Set(messages.map((message) => message.author_user_id))];
  const { data: members, error: membersError } = authorIds.length
    ? await admin.from("event_members").select("user_id, display_name").eq("event_id", eventId).in("user_id", authorIds)
    : { data: [], error: null };

  if (membersError) {
    throw new Error("チャット参加者を読み込めませんでした");
  }

  const names = new Map((members ?? []).map((member) => [member.user_id, member.display_name]));

  return messages.reverse().map((message) => ({
    id: message.id,
    authorName: names.get(message.author_user_id) ?? "参加者",
    body: message.body,
    createdAt: message.created_at,
    isOwn: message.author_user_id === currentUserId
  }));
}
```

ページ本体の取得部分（96-100行）を次のように置き換える:

```tsx
  const isJoined = currentUserId ? await loadEventMembership(eventId, currentUserId) : false;
  const { needsInviteCandidates, needsChatMessages, needsTasks } = resolveEventDetailDataNeeds(tab, isOwner);

  // 開いているタブに必要なものだけを、互いに独立しているので並列で取る。
  const [inviteCandidates, chatMessages, eventTaskData] = await Promise.all([
    needsInviteCandidates && currentUserId ? loadInviteCandidates(eventId, currentUserId) : Promise.resolve([]),
    needsChatMessages && currentUserId ? loadEventChatMessages(eventId, currentUserId) : Promise.resolve([]),
    needsTasks ? loadEventTasks(eventId) : Promise.resolve({ tasks: [], members: [] })
  ]);
  const { tasks: eventTasks, members: taskMembers } = eventTaskData;
```

`import` に `resolveEventDetailDataNeeds` を追加する（Task 1 で作った `@/lib/domain/event-tabs` から）。

既存の `chat.isJoined` と `chat.messages` を参照している箇所を、それぞれ `isJoined` と `chatMessages` に置き換える。該当箇所は以下の3つ:

- イベント情報カードの「このメンバーでもう一度」の表示条件（`chat.isJoined`）
- `EventTaskList` の `canEdit`（`chat.isJoined && event.status !== "cancelled"`）
- `EventChat` の `messages` と `canPost`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/event-detail-data-loading.test.ts`
Expected: PASS（4 tests）

Run: `npm test`
Expected: 全通過

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add "app/events/[eventId]/page.tsx" tests/event-detail-data-loading.test.ts
git commit -m "perf: fetch only the data the opened event tab needs"
```

---

### Task 6: 読み込み中表示をタブ構成に合わせる

**Files:**
- Modify: `app/events/[eventId]/loading.tsx`
- Test: `tests/event-detail-loading.test.tsx`

**Interfaces:**
- Consumes: なし（スケルトンなので実物のコンポーネントは使わない）
- Produces: なし

タブを切り替えるとページ遷移が起きて `loading.tsx` が挟まる。ヘッダーとタブバーを実物と同じ高さで置き、中身だけが差し替わるようにする。

- [ ] **Step 1: Write the failing test**

`tests/event-detail-loading.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "@/app/events/[eventId]/loading";

describe("イベント詳細の読み込み中表示", () => {
  it("読み込み中であることを伝える", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "読み込み中" })).toBeInTheDocument();
  });

  // タブを切り替えるたびに loading.tsx が挟まる。タブバーの位置がずれると
  // 切り替えのたびに画面が跳ねるため、実物と同じ4枠を同じ高さで置いておく。
  it("タブバーの位置を確保する", () => {
    const { container } = render(<Loading />);
    const tabBar = container.querySelector('[data-testid="event-tab-skeleton"]');

    expect(tabBar).toBeInTheDocument();
    expect(tabBar?.children).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-detail-loading.test.tsx`
Expected: FAIL — `expected null to be in the document`

- [ ] **Step 3: Write minimal implementation**

`app/events/[eventId]/loading.tsx`:

```tsx
import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="読み込み中" className="space-y-6">
      <Skeleton className="h-32 w-full" />

      <div data-testid="event-tab-skeleton" className="flex border-b border-line">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex-1 px-2 py-2">
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </div>

      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}
```

ヘッダーのスケルトンを `h-28` から `h-32` に上げているのは、要約行が1行増えるぶんの高さを合わせるため。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/event-detail-loading.test.tsx`
Expected: PASS（2 tests）

Run: `npm test`
Expected: 全通過

Run: `npx tsc --noEmit`、`npm run lint`、`npm run build`
Expected: すべて成功

- [ ] **Step 5: Commit**

```bash
git add "app/events/[eventId]/loading.tsx" tests/event-detail-loading.test.tsx
git commit -m "fix: keep the tab bar in place while the event detail page loads"
```

---

## 完了後の確認

すべてのタスクが終わったら、次を実行して結果を報告する。

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

基準線は「138ファイル671テスト全通過」に、このプランで追加した分（Task 1: 10、Task 2: 6、Task 3: 5、Task 4: 6、Task 5: 4、Task 6: 2 = 33テスト、6ファイル）が加わる。つまり **144ファイル704テスト**が目安になる。
