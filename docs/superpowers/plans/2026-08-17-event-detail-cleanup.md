# イベント詳細ページ 重複実装解消 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/events/[eventId]/page.tsx`にある4箇所の生クラス文字列（プランカード・重複ボタン実装・見出し2箇所・型スケール外の文字サイズ）を、共有UIコンポーネント（`Card`相当のクラス構成・`SubmitButton`・`SectionHeading`）に統一する。

**Architecture:** 対象ファイルは`app/events/[eventId]/page.tsx`1本のみ。`components/ui/server.tsx`/`client.tsx`の既存コンポーネント（`Card`/`SubmitButton`/`SectionHeading`）はそのまま再利用し、新規コンポーネントは作らない。

**Tech Stack:** Next.js (App Router) / React / TypeScript / Tailwind CSS / Vitest + Testing Library

## Global Constraints

- 対象ファイルは`app/events/[eventId]/page.tsx`とそのテスト`tests/event/event-detail-page.test.tsx`のみ。
- `components/ui/server.tsx` / `components/ui/client.tsx`（`Card`/`SubmitButton`/`SectionHeading`自体）は変更しない。
- `design/tokens.css` / `tailwind.config.ts`は変更しない。
- ページの構成・タブ構造・情報の並び順・ボタンの機能とアイコン（`CopyPlus`）は変えない。
- プランカードは`<Link>`のまま（`Card`は`<section>`を描画するため、コンポーネントとしては使わずクラス構成のみ揃える）。

---

## File Structure

- Modify: `app/events/[eventId]/page.tsx` — イベント詳細ページ。overviewタブのプランカード・複製ボタン・見出し、membersタブの見出し、`Info`コンポーネントの4箇所を変更する。
- Modify: `tests/event/event-detail-page.test.tsx` — 上記の変更を検証するテストを追加する。既存の`chain`/`mockServerClient`/`mockAdminClient`/`cancelledEvent`ヘルパーをそのまま再利用する。

## Task 1: プラン一覧カードを`Card`相当のクラス構成に統一

**Files:**
- Modify: `app/events/[eventId]/page.tsx:138`
- Test: `tests/event/event-detail-page.test.tsx`

**Interfaces:**
- Consumes: なし（クラス文字列の変更のみ）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/event-detail-page.test.tsx`の`describe("EventDetailPage - 終了状態のイベント", ...)`ブロックの直後に、新しい`describe`ブロックを追加:

```tsx
describe("EventDetailPage - 重複実装解消（Phase 5）", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });

  function eventWithPlan() {
    return {
      id: "event-1",
      title: "夏合宿",
      status: "date_confirmed",
      owner_user_id: "owner-1",
      category: "other",
      location_name: null,
      url: null,
      memo: null,
      plans: [
        {
          id: "plan-1",
          title: "候補A",
          status: "date_confirmed",
          confirmed_start_at: null,
          answer_deadline_at: null
        }
      ]
    };
  }

  it("プランカードは共有Cardと同じクラス構成（bg-surface / rounded-card / shadow-raise）を持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const planCard = screen.getByRole("link", { name: /候補A/ });
    expect(planCard).toHaveClass("bg-surface", "rounded-card", "shadow-raise");
    expect(planCard).not.toHaveClass("bg-white");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: FAIL（現状のプランカードは`bg-white rounded-control shadow-soft`のため、`bg-surface`/`rounded-card`/`shadow-raise`のアサーションが失敗する）

- [ ] **Step 3: 実装する**

`app/events/[eventId]/page.tsx`のプランカードのクラスを変更:

```tsx
                    <Link key={plan.id} href={`/plans/${plan.id}`} className="rounded-control border border-line bg-white p-4 shadow-soft hover:border-moss">
```

を

```tsx
                    <Link key={plan.id} href={`/plans/${plan.id}`} className="rounded-card border border-line bg-surface p-5 shadow-raise hover:border-moss">
```

に変更（`hover:border-moss`は既存のホバー強調をそのまま維持）。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/[eventId]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "refactor: unify event detail plan card on shared Card classes"
```

## Task 2: 「このメンバーでもう一度」ボタンを`SubmitButton`化

**Files:**
- Modify: `app/events/[eventId]/page.tsx:12`（import文）, `172-180`（ボタン本体）
- Test: `tests/event/event-detail-page.test.tsx`

**Interfaces:**
- Consumes: `SubmitButton`（`@/components/ui`、既存。`variant`/`icon`/`className` props）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

Task 1の`describe`ブロック内、直前のテストの直後に追加:

```tsx
  it("「このメンバーでもう一度」ボタンはSubmitButton由来のクラスを持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: { user_id: "member-1" } });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const duplicateButton = screen.getByRole("button", { name: /このメンバーでもう一度/ });
    // SubmitButtonはaria-busyを常に持つ（useFormStatusのpending状態を反映するため）。
    // 独自実装のbuttonにはこの属性がなく、Badge化テスト同様の「実装が元に戻っても検知できる」観点。
    expect(duplicateButton).toHaveAttribute("aria-busy", "false");
    expect(duplicateButton).toHaveClass("border-line-strong");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: FAIL（現状の独自`<button>`には`aria-busy`属性がなく、`border-line`は持つが`border-line-strong`は持たない）

- [ ] **Step 3: 実装する**

`app/events/[eventId]/page.tsx`のimport文を変更:

```tsx
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink, Skeleton } from "@/components/ui";
```

を

```tsx
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink, SectionHeading, Skeleton, SubmitButton } from "@/components/ui";
```

に変更。

複製ボタンの実装を変更:

```tsx
              {isJoined ? (
                <form action={duplicateEventAction.bind(null, event.id)}>
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                  >
                    <CopyPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                    このメンバーでもう一度
                  </button>
                </form>
              ) : null}
```

を

```tsx
              {isJoined ? (
                <form action={duplicateEventAction.bind(null, event.id)}>
                  <SubmitButton variant="secondary" icon={<CopyPlus aria-hidden="true" className="h-4 w-4" />}>
                    このメンバーでもう一度
                  </SubmitButton>
                </form>
              ) : null}
```

に変更。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/[eventId]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "refactor: replace duplicate-event button with shared SubmitButton"
```

## Task 3: 見出し2箇所を`SectionHeading`化

**Files:**
- Modify: `app/events/[eventId]/page.tsx:134`, `200-210`
- Test: `tests/event/event-detail-page.test.tsx`

**Interfaces:**
- Consumes: `SectionHeading`（`@/components/ui`、Task 2で追加済みのimportをそのまま使う。`title`/`description`/`action` props）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

Task 2のテストの直後に追加:

```tsx
  it("「日程調整」見出しはSectionHeading由来のtext-titleクラスを持つ", async () => {
    const event = eventWithPlan();
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const heading = screen.getByRole("heading", { name: "日程調整" });
    expect(heading).toHaveClass("text-title");
    expect(heading).not.toHaveClass("text-xl");
  });

  it("「参加者」見出しはSectionHeading化されても、参加人数と募集状態の表示を保つ", async () => {
    const event = { ...eventWithPlan(), status: "participants_open" };
    mockServerClient(event);
    mockAdminClient({ memberCount: 4, membershipRow: null });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({ tab: "members" })
      })
    );

    const heading = screen.getByRole("heading", { name: "参加者" });
    expect(heading).toHaveClass("text-title");
    expect(screen.getByText("参加済み 4人")).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: FAIL（現状の見出しは`text-xl font-semibold`で`text-title`クラスを持たない）

- [ ] **Step 3: 実装する**

`app/events/[eventId]/page.tsx`の「日程調整」見出しを変更:

```tsx
              <h2 className="text-xl font-semibold text-ink">日程調整</h2>
```

を

```tsx
              <SectionHeading title="日程調整" />
```

に変更。

「参加者」見出しを含む外側のdivを変更:

```tsx
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">参加者</h2>
                  <p className="mt-2 text-sm text-muted">参加済み {memberCount ?? 0}人</p>
                </div>
                {isEventTerminal ? null : canStartAdjustment ? (
                  <span className="text-sm font-bold text-pine">日程調整の準備中</span>
                ) : (
                  <span className="text-sm font-bold text-muted">参加者を募集中</span>
                )}
              </div>
```

を

```tsx
              <SectionHeading
                title="参加者"
                description={`参加済み ${memberCount ?? 0}人`}
                action={
                  isEventTerminal ? null : canStartAdjustment ? (
                    <span className="text-sm font-bold text-pine">日程調整の準備中</span>
                  ) : (
                    <span className="text-sm font-bold text-muted">参加者を募集中</span>
                  )
                }
              />
```

に変更。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/[eventId]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "refactor: unify event detail section headings on shared SectionHeading"
```

## Task 4: `Info`コンポーネントの文字サイズを型スケール内に統一

**Files:**
- Modify: `app/events/[eventId]/page.tsx:449`
- Test: `tests/event/event-detail-page.test.tsx`

**Interfaces:**
- Consumes: なし（クラス文字列の変更のみ）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

Task 3のテストの直後に追加:

```tsx
  it("付随情報欄（Info）の値は型スケール内のtext-bodyクラスを持つ", async () => {
    const event = { ...eventWithPlan(), location_name: "市民ホール" };
    mockServerClient(event);
    mockAdminClient({ memberCount: 1, membershipRow: null });
    getCurrentUserId.mockResolvedValue("owner-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({})
      })
    );

    const value = screen.getByText("市民ホール");
    expect(value).toHaveClass("text-body", "font-bold");
    expect(value).not.toHaveClass("text-base");
  });
});
```

（この`}`はTask 1で開いた`describe("EventDetailPage - 重複実装解消（Phase 5）", ...)`ブロックを閉じる）

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: FAIL（現状は`text-base font-semibold`のため、`text-body`/`font-bold`のアサーションが失敗する）

- [ ] **Step 3: 実装する**

`app/events/[eventId]/page.tsx`の`Info`コンポーネントを変更:

```tsx
      <dd className="mt-2 break-words text-base font-semibold text-ink">{value}</dd>
```

を

```tsx
      <dd className="mt-2 break-words text-body font-bold text-ink">{value}</dd>
```

に変更。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add app/events/[eventId]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "style: use in-scale text-body for event detail info values"
```

## 変更しないもの

- ページの構成・タブ構造・情報の並び順
- 色のトーン、ボタンの機能・アイコン（`CopyPlus`）
- `Card`/`SubmitButton`/`SectionHeading`コンポーネント自体
- `design/tokens.css` / `tailwind.config.ts`

## 最終検証

全4タスク完了後、以下を実行する。

1. `npm run typecheck`
2. `npx vitest run --reporter=dot`（全体、既存分+今回追加分がすべてPASS、退行がないことを確認）
3. `npm run build`
4. `npm run dev`を起動し、ブラウザで実機確認:
   - プランカードの立体感（`Card`と同じ見た目になっているか）
   - 「このメンバーでもう一度」ボタンの見た目・disabled/pending挙動
   - 「日程調整」「参加者」見出しのサイズ、「参加者」見出し横の状態表示（準備中/募集中）が崩れていないか
   - 付随情報欄（カテゴリ/場所メモ/URL/メモ）の文字サイズ
