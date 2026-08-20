# イベント詳細ページ 状態span Badge化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/events/[eventId]/page.tsx` の「参加者」セクションにある2つの生span（状態表示）を、共有`Badge`コンポーネントに置き換える。

**Architecture:** 変更は1ファイル・1インポート追加・2箇所のJSX置き換えのみ。`Badge`コンポーネント本体（`components/ui/server.tsx`）は無変更で、既存の5トーンから`done`/`neutral`を選んで使う。

**Tech Stack:** Next.js (App Router, Server Component), React, Vitest + Testing Library。

## Global Constraints

- 「日程調整の準備中」は `<Badge tone="done">` にする（spec: `docs/superpowers/specs/2026-08-17-event-detail-status-badges-design.md`、ユーザー承認済みトーン案B）。
- 「参加者を募集中」は `<Badge tone="neutral">` にする。
- `dot` propは使わない（Badgeの既定値`false`のまま）。
- `isEventTerminal ? null : canStartAdjustment ? ... : ...` という既存の条件分岐の構造・ロジックは変更しない。
- `Badge`コンポーネント自体・`design/tokens.css`・`tailwind.config.ts`は変更しない。
- 同ファイル117行目付近の`progress.statusLabel`pill（多値・別トーン対応表が必要）はスコープ外。今回触らない。
- テストは`npx vitest run --reporter=dot`で実行する（既定レポーターは全170ファイル分出力されるため）。

---

### Task 1: 状態spanをBadgeコンポーネントに置き換える

**Files:**
- Modify: `app/events/[eventId]/page.tsx:12`（importにBadgeを追加）
- Modify: `app/events/[eventId]/page.tsx:201-205`（2つのspanをBadgeに置き換え）
- Test: `tests/event/event-detail-page.test.tsx`（末尾に新規`describe`ブロックを追加）

**Interfaces:**
- Consumes: `Badge`コンポーネント（`@/components/ui`からexport済み、`components/ui/server.tsx:200`前後）。シグネチャ: `Badge({ children: ReactNode; tone?: "neutral" | "info" | "warn" | "accent" | "done"; dot?: boolean })`。`tone`未指定時は`neutral`。
- Produces: 変更なし（このページの外部インターフェースには影響しない）。

**現状のコード（`app/events/[eventId]/page.tsx:197-207`）:**
```tsx
            <Card>
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
            </Card>
```

- [ ] **Step 1: 失敗するテストを2つ書く**

`tests/event/event-detail-page.test.tsx`の末尾（290行目、ファイル終端）に以下の`describe`ブロックを追加する。既存の`chain`/`mockServerClient`/`mockAdminClient`（ファイル冒頭で定義済み、モジュールスコープ）をそのまま使う。

```tsx
describe("EventDetailPage - 状態span Badge化（Phase 6）", () => {
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

  it("「日程調整の準備中」はBadgeのdoneトーンで表示される", async () => {
    const event = eventWithPlan();
    // canStartDateAdjustmentはイベントが終了状態でなく、招待がclosedのときtrueになる
    mockServerClient(event, { token: "invite-1", status: "closed" });
    mockAdminClient({ memberCount: 4, membershipRow: null });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({ tab: "members" })
      })
    );

    const badge = screen.getByText("日程調整の準備中");
    // bg-mist/text-pineがdoneトーンのクラス。text-captionはBadge固有のクラスで、
    // 生spanに戻ってしまった場合の検知に使う（events-page.test.tsxの既存パターンを踏襲）。
    expect(badge).toHaveClass("bg-mist", "text-pine", "text-caption");
  });

  it("「参加者を募集中」はBadgeのneutralトーンで表示される", async () => {
    const event = eventWithPlan();
    mockServerClient(event, { token: "invite-1", status: "open" });
    mockAdminClient({ memberCount: 2, membershipRow: null });
    getCurrentUserId.mockResolvedValue("member-1");

    render(
      await EventDetailPage({
        params: Promise.resolve({ eventId: "event-1" }),
        searchParams: Promise.resolve({ tab: "members" })
      })
    );

    const badge = screen.getByText("参加者を募集中");
    expect(badge).toHaveClass("bg-sunken", "text-muted", "text-caption");
  });
});
```

- [ ] **Step 2: テストを実行して失敗することを確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: 新規追加した2件がFAIL（現状のspanには`bg-mist`/`bg-sunken`/`text-caption`クラスが存在しないため）。他の既存テストはPASSのまま。

- [ ] **Step 3: importにBadgeを追加する**

`app/events/[eventId]/page.tsx:12`を変更:

```tsx
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SecondaryLink, SectionHeading, Skeleton, SubmitButton } from "@/components/ui";
```

- [ ] **Step 4: 2箇所のspanをBadgeに置き換える**

`app/events/[eventId]/page.tsx:200-206`を変更:

```tsx
                action={
                  isEventTerminal ? null : canStartAdjustment ? (
                    <Badge tone="done">日程調整の準備中</Badge>
                  ) : (
                    <Badge tone="neutral">参加者を募集中</Badge>
                  )
                }
```

- [ ] **Step 5: テストを実行して全て通ることを確認する**

Run: `npx vitest run tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: 全件PASS（新規2件＋既存の全テスト、退行なし）。

- [ ] **Step 6: 型チェックとビルドを確認する**

Run: `npm run typecheck`
Expected: エラーなし

Run: `npm run build`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add app/events/[eventId]/page.tsx tests/event/event-detail-page.test.tsx
git commit -m "feat: replace raw status spans with shared Badge component

Phase 5 final review flagged these as scope-out Minor finding.
準備中=done tone, 募集中=neutral tone (user-approved via visual companion)."
```

---

## Self-Review

**Spec coverage:** specの「変更内容」2点（202行目→`Badge tone=\"done\"`、204行目→`Badge tone=\"neutral\"`）はStep 3-4で実装。「変更しないもの」（条件分岐構造・Badge本体・117行目pill）はGlobal Constraintsに明記し、Task 1のコード変更もそれらに触れていない。検証方法（typecheck/vitest/build/ブラウザ確認）はStep 2・5・6でカバー。ブラウザでの実機確認は最終レビュー前にユーザーが`npm run dev`で行う想定（このタスク自体はvitest内のレンダリング検証で十分）。

**Placeholder scan:** なし。全ステップに実コードあり。

**Type consistency:** `Badge`のprops名（`tone`/`children`）はTask 1内で一貫。他タスクへの依存なし（単一タスクのプラン）。
