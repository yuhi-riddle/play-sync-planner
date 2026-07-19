# Madoi Mobile Navigation and Event List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマートフォンの主要ナビゲーションを固定し、日付とつながりの操作を狭い画面へ収め、イベント一覧へ具体的な状態を1つだけ表示する。

**Architecture:** 画面パスの判定とイベント状態の判定は純粋関数へ分け、表示コンポーネントから条件分岐を減らす。レスポンシブ切り替えはCSSを使い、追加のデータ取得や画面幅監視は行わない。Googleマップは外部APIを呼ばず、目的地だけを渡すURLで開く。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、Vitest、Testing Library

## Global Constraints

- スマートフォンの主要ナビゲーションは「ホーム」「イベント」「カレンダー」「つながり」の4項目だけにする。
- ログイン、同意、初回設定、公開共有、回答、作成、編集、確定の画面では固定下部ナビゲーションを表示しない。
- 320px相当の画面でも日付7列を横スクロールさせない。
- 「つながり」はスマートフォンでドロップダウン、デスクトップでタブを使う。
- イベントカードの状態は1つだけ表示し、「気になる」「対応中」は使わない。
- GoogleログインとGoogle Calendarだけを扱い、純正カレンダーや別ログイン方式を追加しない。
- Googleマップのために位置情報権限、外部API、APIキーを追加しない。
- `/me` が完成するまでプロフィール画像の遷移先を変更しない。
- 新しい実行時依存パッケージを追加しない。
- Windowsでは `npm.cmd` を使う。

---

## File Structure

### 新規ファイル

- `lib/navigation-visibility.ts`: 固定下部ナビゲーションを表示するパスか判定する。
- `lib/google-maps.ts`: Googleマップ経路URLを生成する。
- `components/google-maps-directions-link.tsx`: 場所がある場合だけ経路リンクを表示する。
- `tests/navigation-visibility.test.ts`: パス判定の境界を検証する。
- `tests/google-maps-directions-link.test.tsx`: URL生成とリンク表示を検証する。

### 変更ファイル

- `components/primary-nav.tsx`: モバイル固定・デスクトップ上部の4項目ナビゲーションを描画する。
- `components/mobile-event-fab.tsx`: イベント作成ボタンを固定下部ナビゲーションの上へ移す。
- `app/layout.tsx`: 固定ナビゲーションに本文とフッターが隠れない余白を持たせる。
- `components/home-selected-date-agenda.tsx`: 7日分を縮小可能な均等列へ変える。
- `components/connection-list.tsx`: モバイルのドロップダウンとデスクトップのタブで状態を共有する。
- `lib/event-filter.ts`: 一覧用状態の型、ラベル、優先順位を定義する。
- `components/event-list-controls.tsx`: 「対応中」を「進行中」へ変える。
- `app/events/page.tsx`: イベントカードを状態、名前、日時、場所、参加人数へ絞る。
- `app/events/[eventId]/page.tsx`: 場所の下へGoogleマップ経路リンクを置く。
- `docs/current-status.md`: 完成したUI改善を実装済み一覧へ追記する。
- `tests/primary-nav.test.tsx`
- `tests/mobile-event-fab.test.tsx`
- `tests/layout-responsive.test.tsx`
- `tests/home-selected-date-agenda.test.tsx`
- `tests/connection-list.test.tsx`
- `tests/domain/event-filter.test.ts`
- `tests/event-list-controls.test.tsx`
- `tests/events-page.test.tsx`

---

### Task 1: 固定下部ナビゲーションと表示パス

**Files:**
- Create: `lib/navigation-visibility.ts`
- Create: `tests/navigation-visibility.test.ts`
- Modify: `components/primary-nav.tsx`
- Modify: `components/mobile-event-fab.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/primary-nav.test.tsx`
- Test: `tests/mobile-event-fab.test.tsx`
- Test: `tests/layout-responsive.test.tsx`

**Interfaces:**
- Produces: `shouldShowPrimaryNavigation(pathname: string): boolean`
- Consumes: `usePathname()` from Next.js in `PrimaryNav` and `MobileEventFab`

- [ ] **Step 1: パス判定の失敗テストを書く**

```ts
// tests/navigation-visibility.test.ts
import { describe, expect, it } from "vitest";
import { shouldShowPrimaryNavigation } from "@/lib/navigation-visibility";

describe("shouldShowPrimaryNavigation", () => {
  it.each(["/", "/events", "/events/event-1", "/plans", "/plans/plan-1", "/connections", "/settings"])(
    "shows navigation on %s",
    (pathname) => expect(shouldShowPrimaryNavigation(pathname)).toBe(true)
  );

  it.each([
    "/login",
    "/consent",
    "/auth/callback",
    "/onboarding/profile",
    "/s/token/answer",
    "/invites/token",
    "/events/new",
    "/events/event-1/edit",
    "/events/event-1/plans/new",
    "/plans/plan-1/edit",
    "/plans/plan-1/confirm",
    "/terms",
    "/privacy"
  ])("hides navigation on %s", (pathname) => expect(shouldShowPrimaryNavigation(pathname)).toBe(false));
});
```

- [ ] **Step 2: パス判定テストが失敗することを確認する**

Run: `npm.cmd test -- tests/navigation-visibility.test.ts`  
Expected: FAIL。`@/lib/navigation-visibility` が存在しない。

- [ ] **Step 3: パス判定を実装する**

```ts
// lib/navigation-visibility.ts
const hiddenExactPaths = new Set(["/login", "/consent", "/terms", "/privacy"]);
const hiddenPrefixes = ["/auth/", "/onboarding/", "/s/", "/invites/"];
const focusedExactPaths = new Set(["/events/new"]);
const focusedPatterns = [
  /^\/events\/[^/]+\/edit$/,
  /^\/events\/[^/]+\/plans\/new$/,
  /^\/plans\/[^/]+\/edit$/,
  /^\/plans\/[^/]+\/confirm$/
];

export function shouldShowPrimaryNavigation(pathname: string) {
  if (hiddenExactPaths.has(pathname)) return false;
  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  if (focusedExactPaths.has(pathname)) return false;
  return !focusedPatterns.some((pattern) => pattern.test(pathname));
}
```

- [ ] **Step 4: パス判定テストが通ることを確認する**

Run: `npm.cmd test -- tests/navigation-visibility.test.ts`  
Expected: PASS。

- [ ] **Step 5: ナビゲーションのレスポンシブ表示テストを更新する**

`tests/primary-nav.test.tsx` では、モバイル固定とデスクトップ静的配置を表すクラスを検証する。

```ts
expect(nav).toHaveClass("fixed", "bottom-0", "grid-cols-4", "sm:static", "sm:grid-cols-4");
expect(screen.getByRole("link", { name: "つながり" })).toHaveAttribute("aria-current", "page");
```

`tests/mobile-event-fab.test.tsx` では、イベント作成ボタンが下部ナビゲーションより上にあることを検証する。

```ts
expect(screen.getByRole("link", { name: "イベントを作る" }).className).toContain("safe-area-inset-bottom");
```

`tests/layout-responsive.test.tsx` では、本文とフッターにモバイル用下余白があることを検証する。

```ts
expect(document.querySelector("main")?.parentElement).toHaveClass("pb-28", "sm:pb-10");
expect(document.querySelector("footer")).toHaveClass("pb-28", "sm:pb-8");
```

- [ ] **Step 6: 更新した表示テストが失敗することを確認する**

Run: `npm.cmd test -- tests/primary-nav.test.tsx tests/mobile-event-fab.test.tsx tests/layout-responsive.test.tsx`  
Expected: FAIL。固定配置と下部余白のクラスがまだない。

- [ ] **Step 7: 固定下部ナビゲーションを実装する**

`components/primary-nav.tsx` で既存の `hiddenPrefixes` を削除し、共通関数を使う。`nav` とリンクのクラスを次の構成へ変える。

```tsx
if (!shouldShowPrimaryNavigation(pathname)) return null;

return (
  <nav
    className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 gap-1 border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lift backdrop-blur-md sm:static sm:mb-5 sm:grid-cols-4 sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
    aria-label="主要な画面"
  >
    {items.map((item) => {
      const active = isActive(pathname, item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={clsx(
            "inline-flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:min-h-11 sm:border sm:px-2 sm:text-body sm:shadow-raise",
            active ? "border-moss bg-mist text-pine" : "border-line bg-surface text-muted hover:text-pine"
          )}
        >
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
          <span className="truncate">{item.label}</span>
        </Link>
      );
    })}
  </nav>
);
```

`components/mobile-event-fab.tsx` は現在の表示対象を保ち、集中操作画面の判定も通したうえで、位置をナビゲーションの上へ移す。

```tsx
if (!isFabVisiblePath(pathname) || !shouldShowPrimaryNavigation(pathname)) return null;
```

```tsx
className="fixed right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-soft bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:hidden"
```

`app/layout.tsx` の本文ラッパーを `pb-28 sm:pb-10`、フッターを `pb-28 sm:pb-8` にする。

- [ ] **Step 8: ナビゲーション関連テストを通す**

Run: `npm.cmd test -- tests/navigation-visibility.test.ts tests/primary-nav.test.tsx tests/mobile-event-fab.test.tsx tests/layout-responsive.test.tsx`  
Expected: PASS。

- [ ] **Step 9: コミットする**

```powershell
git add lib/navigation-visibility.ts components/primary-nav.tsx components/mobile-event-fab.tsx app/layout.tsx tests/navigation-visibility.test.ts tests/primary-nav.test.tsx tests/mobile-event-fab.test.tsx tests/layout-responsive.test.tsx
git commit -m "feat: add mobile fixed navigation"
```

---

### Task 2: ホームの日付7列を狭い画面へ収める

**Files:**
- Modify: `components/home-selected-date-agenda.tsx`
- Test: `tests/home-selected-date-agenda.test.tsx`

**Interfaces:**
- Consumes: 現在の `weekDays` と `selectDate(dateKey: string)`
- Produces: 横スクロールなしの7列日付選択

- [ ] **Step 1: レスポンシブ列の失敗テストを書く**

```ts
it("keeps all seven date buttons in shrinkable columns", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  const { container } = render(
    <HomeSelectedDateAgenda selectedDateKey="2026-07-19" todayDateKey="2026-07-19" initialItems={[]} />
  );

  const dateGrid = container.querySelector('[data-testid="home-week-grid"]');
  expect(dateGrid).toHaveClass("grid-cols-[repeat(7,minmax(0,1fr))]", "gap-0.5", "sm:gap-1");
  expect(dateGrid?.querySelectorAll("button")).toHaveLength(7);
  for (const button of Array.from(dateGrid?.querySelectorAll("button") ?? [])) {
    expect(button).toHaveClass("min-w-0", "px-0.5");
  }
});
```

- [ ] **Step 2: 日付幅テストが失敗することを確認する**

Run: `npm.cmd test -- tests/home-selected-date-agenda.test.tsx`  
Expected: FAIL。`data-testid` と縮小可能な列クラスがない。

- [ ] **Step 3: 日付カードと7列を縮小可能にする**

`components/home-selected-date-agenda.tsx` の日付カード部分を次のクラス構成へ変える。

```tsx
<div className="rounded-control border border-line bg-sunken p-2 sm:p-3">
  {/* 見出しと前後週ボタンは既存のまま */}
  <div
    data-testid="home-week-grid"
    className="mt-3 grid grid-cols-[repeat(7,minmax(0,1fr))] gap-0.5 sm:gap-1"
  >
    {weekDays.map((dateKey) => (
      <button
        type="button"
        key={dateKey}
        onClick={() => selectDate(dateKey)}
        aria-current={dateKey === activeDateKey ? "date" : undefined}
        className={clsx(
          "grid min-h-14 min-w-0 place-items-center rounded-control border px-0.5 py-2 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-16 sm:px-1",
          dateKey === activeDateKey ? "border-pine bg-ink text-white shadow-soft" : "border-line bg-surface text-ink hover:border-moss"
        )}
      >
        <span className="truncate text-[0.7rem] font-bold sm:text-caption">{weekdayLabel(dateKey)}</span>
        <span className="mt-1 truncate text-xs font-bold tabular-nums sm:text-body">{shortDateLabel(dateKey)}</span>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: ホーム日付テストを通す**

Run: `npm.cmd test -- tests/home-selected-date-agenda.test.tsx`  
Expected: PASS。

- [ ] **Step 5: コミットする**

```powershell
git add components/home-selected-date-agenda.tsx tests/home-selected-date-agenda.test.tsx
git commit -m "fix: keep home date strip within mobile width"
```

---

### Task 3: 「つながり」のモバイル用ドロップダウン

**Files:**
- Modify: `components/connection-list.tsx`
- Test: `tests/connection-list.test.tsx`

**Interfaces:**
- Consumes: `ConnectionTabId` と既存の `tabs`
- Produces: モバイル `select` とデスクトップ `tablist` が共有する `activeTab`

- [ ] **Step 1: ドロップダウンの失敗テストを書く**

```ts
it("switches the mobile connection group from one dropdown", () => {
  render(
    <ConnectionList favorites={[favorite]} mutualFollows={[]} following={[following]} candidates={[candidate]} blockedUsers={[blockedUser]} />
  );

  const select = screen.getByRole("combobox", { name: "表示するつながり" });
  expect(select).toHaveClass("sm:hidden");
  expect(screen.getByRole("option", { name: "お気に入り (1件)" })).toBeInTheDocument();

  fireEvent.change(select, { target: { value: "following" } });
  expect(screen.getByText("はるかさん")).toBeInTheDocument();
  expect(screen.queryByText("あきらさん")).not.toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "つながりを絞り込む" }).parentElement).toHaveClass("hidden", "sm:block");
});
```

- [ ] **Step 2: ドロップダウンテストが失敗することを確認する**

Run: `npm.cmd test -- tests/connection-list.test.tsx`  
Expected: FAIL。モバイル用 `combobox` がない。

- [ ] **Step 3: モバイル用ドロップダウンを実装する**

既存タブの直前へ次を追加し、タブの外側を `hidden pb-1 sm:block` に変える。

```tsx
<label className="grid gap-2 sm:hidden" htmlFor="connection-group-select">
  <span className="text-sm font-bold text-ink">表示するつながり</span>
  <select
    id="connection-group-select"
    value={activeTab}
    onChange={(event) => setActiveTab(event.target.value as ConnectionTabId)}
    className="min-h-11 w-full rounded-control border border-line bg-surface px-3 py-2 text-base font-bold text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
  >
    {tabs.map((tab) => (
      <option key={tab.id} value={tab.id}>{`${tab.label} (${tab.people.length}件)`}</option>
    ))}
  </select>
</label>

<div className="hidden pb-1 sm:block">
  <div role="tablist" aria-label="つながりを絞り込む" className="flex flex-wrap gap-2">
    {/* 既存のタブボタン */}
  </div>
</div>
```

横スクロール用の `overflow-x-auto` と `min-w-max` は削除する。`activeTab`、キーボード操作、タブパネル、空表示は既存ロジックを使う。

- [ ] **Step 4: つながりテストを通す**

Run: `npm.cmd test -- tests/connection-list.test.tsx`  
Expected: PASS。

- [ ] **Step 5: コミットする**

```powershell
git add components/connection-list.tsx tests/connection-list.test.tsx
git commit -m "feat: add mobile connection filter"
```

---

### Task 4: イベント一覧の具体的な状態と簡潔なカード

**Files:**
- Modify: `lib/event-filter.ts`
- Modify: `components/event-list-controls.tsx`
- Modify: `app/events/page.tsx`
- Test: `tests/domain/event-filter.test.ts`
- Test: `tests/event-list-controls.test.tsx`
- Test: `tests/events-page.test.tsx`

**Interfaces:**
- Produces: `EventDisplayState`
- Produces: `eventDisplayStateLabels: Record<EventDisplayState, string>`
- Produces: `getEventDisplayState(event: EventListItem, now?: Date): EventDisplayState`
- Updates: `getEventCardSummary()` returns `displayState`

- [ ] **Step 1: 状態優先順位の失敗テストを書く**

`tests/domain/event-filter.test.ts` の import に `getEventDisplayState` と `eventDisplayStateLabels` を追加する。

```ts
it("derives one concrete display state by priority", () => {
  const cases = [
    [{ status: "done", plans: [{ settlement_status: "needed" }] }, "settlement_waiting"],
    [{ status: "cancelled", plans: [{ settlement_status: "not_started" }] }, "cancelled"],
    [{ status: "done", plans: [{ settlement_status: "settled" }] }, "completed"],
    [{ status: "planning", plans: [{ status: "collecting_answers", settlement_status: "not_started" }] }, "answer_waiting"],
    [{ status: "confirmed", plans: [{ status: "date_confirmed", settlement_status: "not_started", confirmed_start_at: "2026-08-01T10:00:00+09:00" }] }, "event_waiting"],
    [{ status: "interested", plans: [] }, "participant_waiting"],
    [{ status: "planning", plans: [] }, "schedule_creation_waiting"]
  ] as const;

  for (const [event, expected] of cases) {
    expect(getEventDisplayState(event, now)).toBe(expected);
  }

  expect(eventDisplayStateLabels).toEqual({
    participant_waiting: "参加者待ち",
    schedule_creation_waiting: "日程作成待ち",
    answer_waiting: "回答待ち",
    event_waiting: "開催待ち",
    settlement_waiting: "清算待ち",
    completed: "完了",
    cancelled: "中止"
  });
});
```

- [ ] **Step 2: 状態テストが失敗することを確認する**

Run: `npm.cmd test -- tests/domain/event-filter.test.ts`  
Expected: FAIL。新しい型、ラベル、関数がない。

- [ ] **Step 3: 一覧用状態を実装する**

```ts
// lib/event-filter.ts
export type EventDisplayState =
  | "participant_waiting"
  | "schedule_creation_waiting"
  | "answer_waiting"
  | "event_waiting"
  | "settlement_waiting"
  | "completed"
  | "cancelled";

export const eventDisplayStateLabels: Record<EventDisplayState, string> = {
  participant_waiting: "参加者待ち",
  schedule_creation_waiting: "日程作成待ち",
  answer_waiting: "回答待ち",
  event_waiting: "開催待ち",
  settlement_waiting: "清算待ち",
  completed: "完了",
  cancelled: "中止"
};

export function getEventDisplayState(event: EventListItem, now = new Date()): EventDisplayState {
  const lifecycleFinished = isEventLifecycleFinished(event, now);
  const settlementFinished = isEventSettlementFinished(event);
  const plans = event.plans ?? [];

  if (lifecycleFinished && !settlementFinished) return "settlement_waiting";
  if (event.status === "cancelled") return "cancelled";
  if (lifecycleFinished) return "completed";
  if (plans.some((plan) => plan.status === "collecting_answers")) return "answer_waiting";
  if (getEventSchedule(event, now).isConfirmed) return "event_waiting";
  if (event.status === "interested") return "participant_waiting";
  return "schedule_creation_waiting";
}
```

`getEventCardSummary()` の `nextAction` を削除し、戻り値へ `displayState: getEventDisplayState(event, now)` を追加する。

- [ ] **Step 4: 状態テストを通す**

Run: `npm.cmd test -- tests/domain/event-filter.test.ts`  
Expected: PASS。

- [ ] **Step 5: 一覧文言とカード構成の失敗テストを書く**

`tests/event-list-controls.test.tsx` の「対応中」期待値を次へ変える。

```ts
expect(screen.getByRole("option", { name: "進行中" })).toBeInTheDocument();
expect(screen.queryByRole("option", { name: "対応中" })).not.toBeInTheDocument();
```

`tests/events-page.test.tsx` に具体的な状態と簡潔なカードを追加する。

```ts
it("shows one concrete state and keeps the event card concise", async () => {
  const eventQuery = createEventQuery([{ ...makeEvent("event-1", "週末の謎解き会"), status: "interested", location_name: "新宿", event_members: [{ status: "joined" }] }]);
  const rpc = createRpcResult(["event-1"], 1);
  const draftQuery = createDraftQuery(null);
  createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    rpc,
    from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
  });

  render(await EventsPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByText("参加者待ち")).toBeInTheDocument();
  expect(screen.getByText("新宿")).toBeInTheDocument();
  expect(screen.getByText("参加 1人")).toBeInTheDocument();
  expect(screen.queryByText("気になる")).not.toBeInTheDocument();
  expect(screen.queryByText(/日程調整 \d+件/)).not.toBeInTheDocument();
});
```

- [ ] **Step 6: 一覧表示テストが失敗することを確認する**

Run: `npm.cmd test -- tests/event-list-controls.test.tsx tests/events-page.test.tsx`  
Expected: FAIL。「対応中」と旧カード項目が残っている。

- [ ] **Step 7: 一覧文言とカードを簡潔にする**

`components/event-list-controls.tsx` の `active` optionを次へ変える。

```tsx
<option value="active">進行中</option>
```

`app/events/page.tsx` の `EventCard` は状態、名前、日時、場所、参加人数だけを描画する。

```tsx
function EventCard({ event, showCancel }: { event: EventRow; showCancel: boolean }) {
  const summary = getEventCardSummary(event);
  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <span className="inline-flex rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
          {eventDisplayStateLabels[summary.displayState]}
        </span>
        <h2 className="mt-3 text-xl font-bold text-ink">{event.title}</h2>
        <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-3">
          <Meta icon={CalendarDays} text={formatSchedule(summary.schedule)} strong={summary.schedule.isConfirmed} />
          <Meta icon={MapPin} text={event.location_name?.trim() || "場所未設定"} />
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
        </div>
      </Link>
      {showCancel && !isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}
```

不要になった `eventStatusLabels`、`ArrowRight`、`CalendarClock`、`ReceiptText`、`settlementLabels` を削除する。下書きカードで使う `categoryLabels` は残す。

- [ ] **Step 8: 一覧関連テストを通す**

Run: `npm.cmd test -- tests/domain/event-filter.test.ts tests/event-list-controls.test.tsx tests/events-page.test.tsx`  
Expected: PASS。

- [ ] **Step 9: コミットする**

```powershell
git add lib/event-filter.ts components/event-list-controls.tsx app/events/page.tsx tests/domain/event-filter.test.ts tests/event-list-controls.test.tsx tests/events-page.test.tsx
git commit -m "feat: clarify event list states"
```

---

### Task 5: Googleマップの経路リンク

**Files:**
- Create: `lib/google-maps.ts`
- Create: `components/google-maps-directions-link.tsx`
- Create: `tests/google-maps-directions-link.test.tsx`
- Modify: `app/events/[eventId]/page.tsx`

**Interfaces:**
- Produces: `buildGoogleMapsDirectionsUrl(destination: string): string | null`
- Produces: `GoogleMapsDirectionsLink({ destination }: { destination: string | null | undefined })`

- [ ] **Step 1: URLとリンクの失敗テストを書く**

```tsx
// tests/google-maps-directions-link.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleMapsDirectionsLink } from "@/components/google-maps-directions-link";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";

describe("GoogleMapsDirectionsLink", () => {
  it("builds directions without fixing the origin", () => {
    const value = buildGoogleMapsDirectionsUrl(" 渋谷駅 ");
    expect(value).not.toBeNull();
    const url = new URL(value!);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("渋谷駅");
    expect(url.searchParams.get("dir_action")).toBe("navigate");
    expect(url.searchParams.has("origin")).toBe(false);
  });

  it("renders a safe external link only when a destination exists", () => {
    const { rerender } = render(<GoogleMapsDirectionsLink destination="新宿駅" />);
    expect(screen.getByRole("link", { name: "現在地からの経路を見る" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "現在地からの経路を見る" })).toHaveAttribute("rel", "noreferrer");

    rerender(<GoogleMapsDirectionsLink destination="   " />);
    expect(screen.queryByRole("link", { name: "現在地からの経路を見る" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Googleマップテストが失敗することを確認する**

Run: `npm.cmd test -- tests/google-maps-directions-link.test.tsx`  
Expected: FAIL。URL関数とリンクコンポーネントがない。

- [ ] **Step 3: URL生成を実装する**

```ts
// lib/google-maps.ts
export function buildGoogleMapsDirectionsUrl(destination: string) {
  const normalized = destination.trim();
  if (!normalized) return null;

  const params = new URLSearchParams({
    api: "1",
    destination: normalized,
    dir_action: "navigate"
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
```

- [ ] **Step 4: 経路リンクを実装する**

```tsx
// components/google-maps-directions-link.tsx
import { ExternalLink, MapPinned } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";

export function GoogleMapsDirectionsLink({ destination }: { destination: string | null | undefined }) {
  const href = buildGoogleMapsDirectionsUrl(destination ?? "");
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/35 bg-surface px-4 py-2 text-sm font-bold text-pine hover:bg-mist focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      <MapPinned aria-hidden="true" className="h-4 w-4" />
      現在地からの経路を見る
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}
```

`app/events/[eventId]/page.tsx` では既存の場所情報を維持し、`</dl>` の直後にリンクを置く。`dl` の中へリンクだけの要素を追加しない。

```tsx
<dl className="grid gap-3 sm:grid-cols-2">
  <Info label="カテゴリ" value={categoryLabels[event.category as keyof typeof categoryLabels]} />
  <Info label="進行状況" value={event.status === "confirmed" ? "確定" : (event.plans ?? []).length ? "日程調整中" : "参加者募集中"} />
  <Info label="場所メモ" value={event.location_name ?? "未設定"} />
  <Info label="URL" value={event.url ?? "未設定"} />
  <Info label="メモ" value={event.memo ?? "未設定"} />
</dl>
<div>
  <GoogleMapsDirectionsLink destination={event.location_name} />
</div>
```

- [ ] **Step 5: Googleマップテストを通す**

Run: `npm.cmd test -- tests/google-maps-directions-link.test.tsx`  
Expected: PASS。

- [ ] **Step 6: コミットする**

```powershell
git add -- lib/google-maps.ts components/google-maps-directions-link.tsx 'app/events/[eventId]/page.tsx' tests/google-maps-directions-link.test.tsx
git commit -m "feat: add event directions link"
```

---

### Task 6: 文書更新、回帰確認、画面確認

**Files:**
- Modify: `docs/current-status.md`
- Verify: `app/login/page.tsx`
- Verify: `components/calendar-connection-card.tsx`
- Verify: `components/auth-nav.tsx`

**Interfaces:**
- Consumes: Task 1から5までの完成状態
- Produces: テスト・ビルド・モバイル表示の確認記録

- [ ] **Step 1: 実装状況を文書へ追記する**

`docs/current-status.md` の実装済み一覧へ次を追記する。

```markdown
- スマートフォン通常画面の固定下部ナビゲーションと、集中操作画面での非表示
- ホームの日付7列を320px相当でも横にはみ出さない表示
- つながり画面のスマートフォン用ドロップダウン
- イベント一覧の「参加者待ち」「日程作成待ち」「回答待ち」「開催待ち」「清算待ち」表示
- イベント詳細からGoogleマップで現在地からの経路を開く導線
```

- [ ] **Step 2: 対象テストをまとめて実行する**

Run:

```powershell
npm.cmd test -- tests/navigation-visibility.test.ts tests/primary-nav.test.tsx tests/mobile-event-fab.test.tsx tests/layout-responsive.test.tsx tests/home-selected-date-agenda.test.tsx tests/connection-list.test.tsx tests/domain/event-filter.test.ts tests/event-list-controls.test.tsx tests/events-page.test.tsx tests/google-maps-directions-link.test.tsx tests/auth-nav-profile.test.tsx tests/login-consent-form.test.tsx tests/calendar-connection-card.test.tsx
```

Expected: 対象テストがすべてPASS。

- [ ] **Step 3: 全テストを実行する**

Run: `npm.cmd test`  
Expected: 全テストがPASS。

- [ ] **Step 4: ビルドを実行する**

Run: `npm.cmd run build`  
Expected: Next.js production buildが終了コード0で完了する。

- [ ] **Step 5: 実ブラウザでモバイル表示を確認する**

Run: `npm.cmd run dev`  
Expected: 開発サーバーが起動する。

確認幅と確認内容:

```text
320px: 日付7列が画面外へ出ない。下部ナビ、FAB、本文が重ならない。
375px: 4項目のラベルが省略されず、スクロール中も押せる。
390px: つながりのドロップダウンで5分類を切り替えられる。
Desktop: 上部ナビとタブ表示が従来どおり使える。
Event list: 状態が1つだけ表示され、「気になる」「対応中」がない。
Event detail: 場所があるときだけ経路リンクがあり、Googleマップで目的地が入る。
Focused routes: 作成、編集、確定、回答では下部ナビがない。
```

- [ ] **Step 6: Google方針とプロフィール遷移を確認する**

```text
Login: Googleログイン以外のボタンが追加されていない。
Calendar settings: Google Calendarだけを接続・解除できる。
Profile: /me完成前のため、プロフィール画像は/settings#profileのまま。
Settings: 歯車は/settingsへ移動する。
```

- [ ] **Step 7: 最終コミットを作る**

```powershell
git add docs/current-status.md
git commit -m "docs: record mobile navigation polish"
```

- [ ] **Step 8: 作業ツリーとコミット列を確認する**

Run:

```powershell
git status --short
git log --oneline -6
```

Expected: `git status --short` は空。直近にTask 1から6のコミットが並ぶ。
