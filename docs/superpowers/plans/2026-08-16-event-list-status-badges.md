# イベント一覧 状態バッジ改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント一覧（`app/events/page.tsx`）の状態バッジ・下書きバッジ・カテゴリタグの自前ピル実装を共有`Badge`コンポーネントに統一し、7種類ある`EventDisplayState`を視覚的に区別できるようにする。

**Architecture:** 対象ファイルは`app/events/page.tsx`1本のみ。`components/ui/server.tsx`の既存`Badge`コンポーネント（5トーン: neutral/info/warn/accent/done）をそのまま再利用し、新しい状態→トーン対応表を追加する。

**Tech Stack:** Next.js (App Router) / React / TypeScript / Tailwind CSS / Vitest + Testing Library

## Global Constraints

- 対象ファイルは`app/events/page.tsx`とそのテスト`tests/event/events-page.test.tsx`のみ。
- `components/event/event-list-controls.tsx`（状態フィルターチップ等）は対象外。
- `app/plans/page.tsx`（月カレンダー画面）・`app/events/[eventId]/page.tsx`は対象外。
- `components/ui/server.tsx`の`Badge`コンポーネント自体は変更しない。新しいトーンは追加せず、既存の5トーン（neutral/info/warn/accent/done）のみを使う。
- `design/tokens.css` / `tailwind.config.ts`は変更しない。
- 状態→トーン対応表は以下で確定（ユーザー確認済み、変更しない）:
  - `participant_waiting` → `neutral`
  - `schedule_creation_waiting` → `info`
  - `answer_waiting` → `info`
  - `event_waiting` → `accent`
  - `settlement_waiting` → `neutral`
  - `completed` → `done`
  - `cancelled` → `warn`

---

## File Structure

- Modify: `app/events/page.tsx` — イベント一覧ページ。`EventCard`関数の状態バッジと、`EventsPage`内の下書きカードのバッジ2箇所を、いずれも共有`Badge`コンポーネントベースに置き換える。
- Modify: `tests/event/events-page.test.tsx` — 上記の色分け・統一を検証するテストを追加する。

## Task 1: `EventCard`の状態バッジをBadge+トーン対応表に統一

`EventDisplayState`から`BadgeTone`への対応表`eventDisplayStateTones`を追加し、`EventCard`の状態バッジを共有`Badge`コンポーネントに置き換える。

**Files:**
- Modify: `app/events/page.tsx`（import文、`EventCard`関数内、ファイル冒頭付近に対応表を追加）
- Test: `tests/event/events-page.test.tsx`

**Interfaces:**
- Consumes: `Badge`・`BadgeTone`（`@/components/ui`、既存）。`EventDisplayState`（`@/lib/domain/event/event-filter`、既存）。
- Produces: `eventDisplayStateTones: Record<EventDisplayState, BadgeTone>`（`app/events/page.tsx`内のモジュールスコープ定数。Task 2では使わない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/events-page.test.tsx`の`describe("EventsPage", () => {`ブロック内、既存の`it("shows one concrete state and keeps the event card concise", ...)`の直後に追加:

```tsx
  it("colors settlement_waiting, completed, and cancelled with visibly different tones", async () => {
    const pastPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "needed",
      confirmed_start_at: "2020-01-01T00:00:00Z",
      confirmed_end_at: "2020-01-01T00:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([
      { ...makeEvent("event-1", "清算待ちイベント"), plans: [pastPlan] },
      { ...makeEvent("event-2", "完了イベント"), status: "done" },
      { ...makeEvent("event-3", "中止イベント"), status: "cancelled" }
    ]);
    const rpc = createRpcResult(["event-1", "event-2", "event-3"], 3);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    const settlementBadge = screen.getByText("清算待ち");
    const completedBadge = screen.getByText("完了");
    const cancelledBadge = screen.getByText("中止");

    // settlement_waiting は neutral (border-line / bg-sunken / text-muted)
    expect(settlementBadge).toHaveClass("bg-sunken", "text-muted");
    // completed は done (bg-mist / text-pine、現状維持)
    expect(completedBadge).toHaveClass("bg-mist", "text-pine");
    // cancelled は warn (bg-clay/14 相当 / text-clay-ink) で、他の2つと明確に異なる
    expect(cancelledBadge).toHaveClass("text-clay-ink");
    expect(cancelledBadge.className).not.toBe(settlementBadge.className);
    expect(cancelledBadge.className).not.toBe(completedBadge.className);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: FAIL（現状は全状態が`bg-mist text-pine`の同一クラスのため、`settlementBadge`・`cancelledBadge`のクラスアサーションが失敗する）

- [ ] **Step 3: 実装する**

`app/events/page.tsx`の`@/components/ui`のimportを変更:

```tsx
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
```

を

```tsx
import { Badge, type BadgeTone, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
```

に変更。

`export const dynamic = "force-dynamic";`の直後に対応表を追加:

```tsx
export const dynamic = "force-dynamic";

const eventDisplayStateTones: Record<EventDisplayState, BadgeTone> = {
  participant_waiting: "neutral",
  schedule_creation_waiting: "info",
  answer_waiting: "info",
  event_waiting: "accent",
  settlement_waiting: "neutral",
  completed: "done",
  cancelled: "warn"
};
```

`EventDisplayState`型のimportを追加（同ファイル内で`eventDisplayStateLabels`等を既にimportしている行を変更）:

```tsx
import {
  buildEventListHref,
  eventDisplayStateLabels,
  eventMatchesSearch,
  getEventCardSummary,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventListItem
} from "@/lib/domain/event/event-filter";
```

を

```tsx
import {
  buildEventListHref,
  eventDisplayStateLabels,
  eventMatchesSearch,
  getEventCardSummary,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventDisplayState,
  type EventListItem
} from "@/lib/domain/event/event-filter";
```

に変更。

`EventCard`関数内の状態バッジを変更:

```tsx
        <span className="inline-flex rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
          {eventDisplayStateLabels[summary.displayState]}
        </span>
```

を

```tsx
        <Badge tone={eventDisplayStateTones[summary.displayState]}>{eventDisplayStateLabels[summary.displayState]}</Badge>
```

に変更。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "feat: color-code event list status badges by display state"
```

## Task 2: 下書きカードのバッジ2箇所をBadgeに統一

下書きバッジ（`tone="info"`）と、下書きのカテゴリタグ（`tone="done"`）を共有`Badge`コンポーネントに置き換える。

**Files:**
- Modify: `app/events/page.tsx`（`EventsPage`関数内、下書きカードのJSX2箇所）
- Test: `tests/event/events-page.test.tsx`

**Interfaces:**
- Consumes: `Badge`（`@/components/ui`、Task 1で追加済みのimportをそのまま使う）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/events-page.test.tsx`の`describe("EventsPage", () => {`ブロック内、Task 1で追加したテストの直後に追加:

```tsx
  it("shows the draft card's status and category as shared Badge pills", async () => {
    const eventQuery = createEventQuery([]);
    const rpc = createRpcResult([], 0);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "draft" }) }));

    const draftBadge = screen.getByText("下書き");
    expect(draftBadge).toHaveClass("bg-honey/18", "text-honey-ink");

    const categoryBadge = screen.getByText("旅行");
    expect(categoryBadge).toHaveClass("bg-mist", "text-pine", "border-moss/30");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: FAIL（現状の下書きバッジ・カテゴリタグは`Badge`のクラス構成と一致しないため）

- [ ] **Step 3: 実装する**

`app/events/page.tsx`の下書きバッジを変更:

```tsx
                <div className="mb-3 inline-flex rounded-full border border-honey/45 bg-honey/18 px-3 py-1 text-xs font-bold text-honey-ink">
                  下書き
                </div>
```

を

```tsx
                <div className="mb-3">
                  <Badge tone="info">下書き</Badge>
                </div>
```

に変更。

`app/events/page.tsx`の下書きのカテゴリタグを変更:

```tsx
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
                {draftCategory === "all" ? "カテゴリ未設定" : categoryLabels[draftCategory]}
              </span>
```

を

```tsx
              <Badge tone="done">{draftCategory === "all" ? "カテゴリ未設定" : categoryLabels[draftCategory]}</Badge>
```

に変更。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "refactor: unify draft card badges on the shared Badge component"
```

## 変更しないもの

- `event-list-controls.tsx`の状態フィルターチップ・検索欄・ページネーション
- `EventCard`のレイアウト構造・アイコン
- `Badge`コンポーネント自体（5トーンの定義・見た目）
- `design/tokens.css` / `tailwind.config.ts`

## 最終検証

全2タスク完了後、以下を実行する。

1. `npm run typecheck`
2. `npx vitest run --reporter=dot`（全体、既存分+今回追加分がすべてPASS、退行がないことを確認）
3. `npm run build`
4. `npm run dev`を起動し、ブラウザで実機確認:
   - イベント一覧で「完了」「中止」「清算待ち」等、複数状態のイベントが混在した状態で並べ、色で見分けられること
   - 下書きカードのバッジ・カテゴリタグの見た目が大きく崩れていないこと（カテゴリタグにうっすら境界線が付く差分のみ許容範囲）
