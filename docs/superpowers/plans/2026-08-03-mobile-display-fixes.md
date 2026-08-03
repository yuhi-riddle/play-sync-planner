# モバイル表示改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 375px の実機で見つかった表示・操作の問題5件と、同じ確認で見つかった不具合2件を直す。

**Architecture:** 既存コンポーネントへの局所的な変更のみ。新しいコンポーネント・色・パターンは追加しない。判定ロジックが増える箇所（Task 6）だけ `lib/domain/` に純関数として切り出し、`tests/domain/` でテストする。

**Tech Stack:** Next.js App Router（全ページ force-dynamic）/ React 19 / Tailwind CSS / vitest + @testing-library/react（jsdom）

**設計doc:** [docs/superpowers/specs/2026-08-03-mobile-display-fixes-design.md](../specs/2026-08-03-mobile-display-fixes-design.md)

## Global Constraints

- 既存の視覚言語を変えない。色トークン（canvas `#efe7d8` / surface `#fffdf7` / ink `#262320` / moss `#5f7d65` / clay `#df7d69`）に新しい値を足さない
- UIプリミティブは `components/ui.tsx` から import する。`ui-server.tsx` / `ui-client.tsx` を直接 import しない
- `.tsx` では `import React from "react";` を明示する
- 認証は `getCurrentUser()` / `getCurrentUserId()` 経由。生の `auth.getUser()` を書かない（`tests/no-raw-auth-getuser.test.ts` がガードしている）
- jsdom は computed style を取れない。**クラス名の検証**が作法
- **失敗したテストを削除・スキップして「解決」にしない。** 既存テストがレイアウト変更で落ちる場合は、新しい正しい期待値に**更新**する
- テストは `tests/` 直下のみ。ただし `lib/domain/<name>.ts` は `tests/domain/<name>.test.ts` に対応させる
- 単体実行は `npx vitest run <path>`、全体は `npm test`
- コミットは各タスクの最後に1回

---

### Task 1: ヘッダーをモバイルでも1段にする

**Files:**
- Modify: `components/auth-nav.tsx:45-66`
- Modify: `app/layout.tsx:47-49`
- Test: `tests/layout-responsive.test.tsx:48-62`（既存テストの更新）

**Interfaces:**
- Consumes: なし
- Produces: なし（見た目のみ。props も公開関数も変わらない）

**背景:** モバイルで `flex-col` によりロゴ行と `AuthNav` 行が2段になり、`sticky top-0` のヘッダーが約104px を占有している。

- [ ] **Step 1: 既存テストを新しい期待値に書き換える（これが失敗するテスト）**

`tests/layout-responsive.test.tsx` の 48〜62行目のテストを、次の内容に**置き換える**。

```tsx
  it("keeps the brand and account controls on one row at every width", async () => {
    vi.stubGlobal("React", React);
    const layout = await RootLayout({ children: "本文" });
    const markup = renderToStaticMarkup(layout);
    const parsedDocument = new DOMParser().parseFromString(markup, "text/html");
    document.body.innerHTML = parsedDocument.body.innerHTML;

    const headerInner = document.querySelector("header > div");
    const classNames = headerInner?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classNames).toEqual(
      expect.arrayContaining(["flex", "flex-row", "items-center", "justify-between"])
    );
    expect(classNames).not.toContain("flex-col");
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/layout-responsive.test.tsx`
Expected: FAIL。`flex-col` がまだ付いているので `not.toContain("flex-col")` で落ちる。

- [ ] **Step 3: レイアウトのヘッダーを1段にする**

`app/layout.tsx` の47行目を次に差し替える。

```tsx
            <div className="mx-auto flex max-w-[1440px] flex-row items-center justify-between gap-3 px-4 py-2 sm:px-6 sm:py-4 lg:px-8 xl:px-10">
```

同じファイルの49行目、ロゴマークのサイズをモバイルで小さくする。

```tsx
                <span className="relative inline-flex h-8 w-10 items-end justify-center rounded-control border border-line bg-skywash/70 shadow-raise sm:h-10 sm:w-12">
```

- [ ] **Step 4: AuthNav をモバイルでアイコンだけにする**

`components/auth-nav.tsx` の45行目のコンテナを差し替える。

```tsx
    <div className="flex w-full items-center justify-end gap-1 text-sm sm:w-auto sm:gap-2">
```

48行目のプロフィールリンクの `className` を差し替える。

```tsx
        className="flex h-11 w-11 min-w-0 items-center justify-center gap-2 rounded-full border border-line bg-surface text-muted shadow-soft transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:h-auto sm:w-auto sm:justify-start sm:px-3 sm:py-1.5"
```

63行目の名前表示をモバイルで隠す。`aria-label` と `title` は既に付いているので、読み上げと補足は残る。

```tsx
        <span className="hidden min-w-0 truncate font-bold sm:inline sm:max-w-32" title={profileLabel ?? undefined}>
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/layout-responsive.test.tsx tests/auth-nav-profile.test.tsx`
Expected: PASS。`auth-nav-profile.test.tsx` は `aria-label` と表示名を見ているので、名前を `hidden` にしても DOM には残るため落ちない。落ちた場合は、そのテストが「名前が見えること」を検証しているので、`sm:` で見えることに合わせて期待値を更新する。

- [ ] **Step 6: コミット**

```bash
git add components/auth-nav.tsx app/layout.tsx tests/layout-responsive.test.tsx
git commit -m "fix: keep the mobile header on a single row"
```

---

### Task 2: イベント一覧カードで未設定の情報を出さない

**Files:**
- Modify: `app/events/page.tsx:204-208`（メタ情報の並び）
- Modify: `app/events/page.tsx:228-236`（`formatSchedule`）
- Test: `tests/events-page.test.tsx`（テストを1件追加）

**Interfaces:**
- Consumes: なし
- Produces: `formatSchedule` の戻り値が `string | null` になる。`null` は「日程が未設定」を意味し、呼び出し側は行ごと描画しない

**背景:** モバイルでは `grid gap-2` が1列になり、日程・場所・参加人数が縦3行を占める。値が「日程未設定」「場所未設定」でも3行分の高さを使う。

- [ ] **Step 1: 失敗するテストを書く**

`tests/events-page.test.tsx` の `it("shows one concrete state and keeps the event card concise", ...)` の**直後**に次を追加する。

```tsx
  it("omits the schedule and location rows when they are unset", async () => {
    const eventQuery = createEventQuery([{
      ...makeEvent("event-2", "まだ何も決まっていない会"),
      category: "other",
      status: "interested",
      location_name: null,
      event_members: [{ status: "joined" }],
      plans: []
    }]);
    const rpc = createRpcResult(["event-2"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("日程未設定")).not.toBeInTheDocument();
    expect(screen.queryByText("場所未設定")).not.toBeInTheDocument();
    expect(screen.getByText("参加 1人")).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/events-page.test.tsx`
Expected: FAIL。「日程未設定」「場所未設定」が DOM にあるため `not.toBeInTheDocument()` で落ちる。

- [ ] **Step 3: `formatSchedule` が未設定で null を返すようにする**

`app/events/page.tsx` の228〜236行目を差し替える。

```tsx
function formatSchedule(schedule: ReturnType<typeof getEventCardSummary>["schedule"]) {
  if (!schedule.startAt) return null;
  if (schedule.isConfirmed) {
    return `確定 ${formatDateTimeRange(schedule.startAt, schedule.endAt, schedule.isAllDay)}`;
  }
  return !schedule.endAt || schedule.startAt === schedule.endAt
    ? formatDate(schedule.startAt)
    : `${formatDate(schedule.startAt)} - ${formatDate(schedule.endAt)}`;
}
```

- [ ] **Step 4: カードのメタ情報を条件付き描画にして横並びにする**

`app/events/page.tsx` の204〜208行目を差し替える。

```tsx
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {scheduleText ? <Meta icon={CalendarDays} text={scheduleText} strong={summary.schedule.isConfirmed} /> : null}
          {locationText ? <Meta icon={MapPin} text={locationText} /> : null}
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
        </div>
```

同じ関数の195行目（`const summary = getEventCardSummary(event);`）の直後に、2つの値を用意する。

```tsx
  const scheduleText = formatSchedule(summary.schedule);
  const locationText = event.location_name?.trim() || null;
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/events-page.test.tsx`
Expected: PASS（追加した1件と、既存の「新宿」「参加 1人」を見る既存テストの両方）。

- [ ] **Step 6: コミット**

```bash
git add app/events/page.tsx tests/events-page.test.tsx
git commit -m "fix: drop the unset schedule and location rows from event cards"
```

---

### Task 3: FAB が最後のカードに重ならないようにする

**Files:**
- Modify: `app/layout.tsx:61`（本文コンテナ）
- Modify: `app/layout.tsx:67`（フッター）
- Test: `tests/layout-responsive.test.tsx`（`pb-28` を見ている既存の期待値を更新）

**Interfaces:**
- Consumes: なし
- Produces: なし

**背景:** FAB は `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]` に固定され、自身の高さ約3rem を足すと 8.5rem 必要。コンテナの `pb-28`（7rem）では 1.5rem 足りない。

- [ ] **Step 1: 既存テストの期待値を pb-36 に書き換える（これが失敗するテスト）**

`tests/layout-responsive.test.tsx` の中で `pb-28` を期待している3箇所を `pb-36` に変える。対象は次の行。

```tsx
    expect(document.querySelector("main")?.parentElement).toHaveClass("pb-36", "sm:pb-10");
    expect(document.querySelector("footer")).toHaveClass("pb-36", "sm:pb-8");
```

```tsx
    const mainWrapperClasses = document.querySelector("main")?.parentElement?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(mainWrapperClasses).toEqual(expect.arrayContaining(["pb-36", "sm:pb-10"]));

    const footerClasses = document.querySelector("footer")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(footerClasses).toEqual(expect.arrayContaining(["pb-36", "sm:pb-8"]));
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/layout-responsive.test.tsx`
Expected: FAIL。実装がまだ `pb-28` のため。

- [ ] **Step 3: パディングを広げる**

`app/layout.tsx` の61行目。

```tsx
          <div className="mx-auto max-w-[1440px] px-4 pb-36 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:px-8 xl:px-10">
```

67行目。

```tsx
          <footer className="mx-auto max-w-[1440px] px-4 pb-36 text-body text-muted sm:px-6 sm:pb-8 lg:px-8 xl:px-10">
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/layout-responsive.test.tsx tests/mobile-event-fab.test.tsx`
Expected: PASS。FAB 側の `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]` は変えないので `mobile-event-fab.test.tsx` はそのまま通る。

- [ ] **Step 5: コミット**

```bash
git add app/layout.tsx tests/layout-responsive.test.tsx
git commit -m "fix: reserve enough bottom padding for the mobile FAB"
```

---

### Task 4: タスク行のタイトルが潰れないようにする

**Files:**
- Modify: `components/event-task-list.tsx:94-140`
- Test: `tests/event-task-list.test.tsx`（テストを1件追加）

**Interfaces:**
- Consumes: なし
- Produces: なし。`data-testid="event-task-title"` と `data-testid={`event-task-${task.id}`}` は既存テストが使っているので**変えない**

**背景:** `flex flex-wrap items-center gap-3` の1行にチェック・タイトル・担当セレクト・削除が並び、縮まないセレクトに押されてタイトルが1文字幅になる。

- [ ] **Step 1: 失敗するテストを書く**

`tests/event-task-list.test.tsx` の最後の `it` の後に追加する。

```tsx
  it("モバイルではタイトルを独立した行に置く", () => {
    renderList([task({ id: "a", title: "浮き輪を持っていく" })]);

    const row = screen.getByTestId("event-task-a");
    const rowClasses = row.getAttribute("class")?.split(/\s+/) ?? [];
    expect(rowClasses).toContain("flex-col");
    expect(rowClasses).toContain("sm:flex-row");
    expect(rowClasses).not.toContain("flex-wrap");
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/event-task-list.test.tsx`
Expected: FAIL。現在は `flex-wrap` があり `flex-col` が無い。

- [ ] **Step 3: 行を2段構成にする**

`components/event-task-list.tsx` の94〜140行目を差し替える。チェックとタイトルを1行目、担当セレクトと削除を2行目に置く。2行目はチェックボタンの幅（`h-11 w-11`）＋ `gap-3` に合わせて `pl-14` で字下げする。

```tsx
            <div
              key={task.id}
              data-testid={`event-task-${task.id}`}
              className={`flex flex-col gap-2 rounded-control border border-line p-3 sm:flex-row sm:items-center sm:gap-3 ${
                task.doneAt ? "bg-sunken" : "bg-surface"
              }`}
            >
              <div className="flex items-center gap-3 sm:flex-1 sm:min-w-0">
                {canEdit ? (
                  <form action={toggleAction(task.id)}>
                    <button
                      type="submit"
                      className={iconButtonClass}
                      aria-label={task.doneAt ? `${task.title}を未完了に戻す` : `${task.title}を完了にする`}
                    >
                      <Check aria-hidden="true" className={task.doneAt ? "h-4 w-4 text-pine" : "h-4 w-4"} />
                    </button>
                  </form>
                ) : null}

                <span
                  data-testid="event-task-title"
                  className={`min-w-0 flex-1 break-words text-body font-medium ${
                    task.doneAt ? "text-muted line-through" : "text-ink"
                  }`}
                >
                  {task.title}
                </span>
              </div>

              <div className={`flex items-center gap-3 ${canEdit ? "pl-14 sm:pl-0" : ""}`}>
                {canEdit ? (
                  <AssigneeSelect
                    taskId={task.id}
                    members={members}
                    assigneeUserId={task.assigneeUserId}
                    action={assignAction}
                  />
                ) : (
                  <span className="text-caption text-muted">{task.assigneeName ?? "担当なし"}</span>
                )}

                {canEdit ? (
                  <form action={deleteAction(task.id)}>
                    <button type="submit" className={iconButtonClass} aria-label={`${task.title}を削除`}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/event-task-list.test.tsx`
Expected: PASS。既存6件と追加1件の計7件。

- [ ] **Step 5: 追加フォームも縦積みにする**

`components/event-task-list.tsx:146` の追加フォームも同じ理由で潰れる。`flex flex-wrap gap-2` を差し替える。

```tsx
        <form action={createAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
```

- [ ] **Step 6: テストが通ることを再確認してコミット**

Run: `npx vitest run tests/event-task-list.test.tsx`
Expected: PASS

```bash
git add components/event-task-list.tsx tests/event-task-list.test.tsx
git commit -m "fix: stop the task title from collapsing on narrow screens"
```

---

### Task 5: チャットの投稿ボタンを画面内に収める

**Files:**
- Modify: `components/event-chat.tsx:71-88`
- Test: `tests/event-chat.test.tsx`（テストを1件追加）

**Interfaces:**
- Consumes: なし
- Produces: なし

**背景:** `rows={4}` で入力欄が高く、下の注記と投稿ボタンが画面外に出る。ソフトキーボードが出れば確実に隠れる。

- [ ] **Step 1: 失敗するテストを書く**

`tests/event-chat.test.tsx` の最後の `it` の後に追加する。

```tsx
  it("入力欄を低くし、文字数の注記は入力が長くなるまで出さない", () => {
    render(<EventChat messages={[]} action={vi.fn()} canPost />);

    expect(screen.getByLabelText("メッセージ")).toHaveAttribute("rows", "2");
    expect(screen.queryByText("2,000文字まで")).not.toBeInTheDocument();
  });
```

`EventChat` の import と `vi` の import が既にあることを確認する。無ければ追加する。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/event-chat.test.tsx`
Expected: FAIL。`rows` が `4` で、注記が常時表示されている。

- [ ] **Step 3: 入力の長さを持つ状態を足す**

`components/event-chat.tsx` の19行目のあとに追加する。

```tsx
  const [bodyLength, setBodyLength] = useState(0);
```

`submit` 関数の `form.reset();`（31行目）の直後に、カウンタも戻す。

```tsx
        setBodyLength(0);
```

- [ ] **Step 4: textarea と注記を差し替える**

`components/event-chat.tsx` の71〜80行目を差し替える。

```tsx
          <textarea
            id="event-chat-message"
            name="body"
            rows={2}
            maxLength={2000}
            placeholder="参加者にメッセージを送る"
            onChange={(event) => setBodyLength(event.target.value.length)}
            className="w-full rounded-control border border-moss/18 bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{bodyLength > 1800 ? `残り ${2000 - bodyLength}文字` : ""}</p>
```

注記の `<p>` は常に描画するが中身を空にする。要素ごと消すとボタンの右寄せが崩れるため。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/event-chat.test.tsx`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add components/event-chat.tsx tests/event-chat.test.tsx
git commit -m "fix: keep the chat submit button above the fold on mobile"
```

---

### Task 6: 中止イベントに「日程調整を始める」を出さない

**Files:**
- Create: `lib/domain/event-adjustment.ts`
- Create: `tests/domain/event-adjustment.test.ts`
- Modify: `app/events/[eventId]/page.tsx:115`

**Interfaces:**
- Consumes: なし
- Produces: `canStartDateAdjustment(eventStatus: string, inviteStatus: string | null | undefined): boolean`

**背景:** `canStartAdjustment` が招待の締め切り状態しか見ておらず、中止イベントでもボタン・説明文・「日程調整の準備中」が出る。同じ変数が3箇所で使われているので、1箇所直せば3箇所に効く。

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/event-adjustment.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";

import { canStartDateAdjustment } from "@/lib/domain/event-adjustment";

describe("canStartDateAdjustment", () => {
  it("招待を締め切っていれば日程調整へ進める", () => {
    expect(canStartDateAdjustment("planning", "closed")).toBe(true);
  });

  it("招待がまだ開いていれば進めない", () => {
    expect(canStartDateAdjustment("planning", "open")).toBe(false);
  });

  it("招待が無ければ進めない", () => {
    expect(canStartDateAdjustment("planning", null)).toBe(false);
    expect(canStartDateAdjustment("planning", undefined)).toBe(false);
  });

  it("中止したイベントでは、招待を締め切っていても進めない", () => {
    expect(canStartDateAdjustment("cancelled", "closed")).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/domain/event-adjustment.test.ts`
Expected: FAIL。`lib/domain/event-adjustment.ts` が存在しない。

- [ ] **Step 3: 最小の実装を書く**

`lib/domain/event-adjustment.ts` を新規作成する。

```ts
/**
 * 日程調整を始められるかを決める。
 * 招待を締め切っていることに加えて、イベントが中止されていないことを要求する。
 */
export function canStartDateAdjustment(eventStatus: string, inviteStatus: string | null | undefined): boolean {
  if (eventStatus === "cancelled") {
    return false;
  }

  return inviteStatus === "closed";
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/domain/event-adjustment.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: ページから使う**

`app/events/[eventId]/page.tsx` の115行目を差し替える。

```tsx
  const canStartAdjustment = canStartDateAdjustment(event.status, typedInvite?.status);
```

同じファイルの import に追加する（27行目の `resolveEventProgress` の import の近くに置く）。

```tsx
import { canStartDateAdjustment } from "@/lib/domain/event-adjustment";
```

- [ ] **Step 6: 関連テストが壊れていないことを確認してコミット**

Run: `npx vitest run tests/domain/event-adjustment.test.ts tests/event-detail-data-loading.test.ts tests/event-detail-tabs-layout.test.ts`
Expected: PASS

```bash
git add lib/domain/event-adjustment.ts tests/domain/event-adjustment.test.ts "app/events/[eventId]/page.tsx"
git commit -m "fix: hide the start-scheduling action on cancelled events"
```

---

### Task 7: 清算ページがクエリエラーを404にしないようにする

**Files:**
- Modify: `app/plans/[planId]/settlement/page.tsx:144-154`
- Create: `tests/settlement-page-query-error.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし

**背景:** `const { data: plan }` とだけ書いて `error` を捨てているため、クエリの失敗がすべて404になる。実際にマイグレーション025未適用（`participants.settlement_payment_method` が無く PostgREST が 42703 を返す）が「ページが見つかりません」として出て、原因特定に遠回りした。

**行が無い場合（本当の404）と、クエリが失敗した場合（サーバーエラー）を区別する。**

- [ ] **Step 1: 失敗するテストを書く**

`tests/settlement-page-query-error.test.tsx` を新規作成する。

```tsx
import React from "react";
import { describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, getCurrentUserId, notFound } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  getCurrentUserId,
  hasSupabaseAdminEnv: vi.fn(() => true)
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound,
  redirect: vi.fn()
}));

import SettlementPage from "@/app/plans/[planId]/settlement/page";

function mockPlanResult(result: { data: unknown; error: unknown }) {
  createSupabaseAdminClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result)
    }))
  });
}

describe("SettlementPage のクエリ失敗", () => {
  it("列が無いなどのクエリエラーは404にせず投げ直す", async () => {
    vi.stubGlobal("React", React);
    getCurrentUserId.mockResolvedValue("user-1");
    mockPlanResult({
      data: null,
      error: { code: "42703", message: "column participants.settlement_payment_method does not exist" }
    });

    await expect(SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) })).rejects.toThrow(
      /settlement_payment_method/
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("行が無いだけなら従来どおり404にする", async () => {
    vi.stubGlobal("React", React);
    getCurrentUserId.mockResolvedValue("user-1");
    mockPlanResult({ data: null, error: null });

    await expect(SettlementPage({ params: Promise.resolve({ planId: "plan-1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/settlement-page-query-error.test.tsx`
Expected: FAIL。1件目でクエリエラーでも `notFound()` が呼ばれ、`NEXT_NOT_FOUND` が投げられるため。

- [ ] **Step 3: エラーを区別する**

`app/plans/[planId]/settlement/page.tsx` の144行目を差し替える（`const { data: plan } = await supabase` を `const { data: plan, error: planError } = await supabase` にする）。

```tsx
  const { data: plan, error: planError } = await supabase
```

152〜154行目を差し替える。**このコードをそのまま使う。**

```tsx
  // クエリ自体が失敗した場合は404にしない。列の欠落やスキーマ不整合が
  // 「ページが見つかりません」として出ると原因を追えなくなる。
  // ただし PGRST116 は .single() が「行が0件」を報告するだけなので、
  // 従来どおり notFound() に落とす。
  if (planError && planError.code !== "PGRST116") {
    throw new Error(`清算ページのデータ取得に失敗しました: ${planError.message}`);
  }

  if (!plan) {
    notFound();
  }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/settlement-page-query-error.test.tsx`
Expected: PASS（2件）

- [ ] **Step 5: 同じ書き方が他にないか横展開して調べる**

Run: `npx rg "const \{ data: \w+ \} = await supabase" app lib`

見つかった箇所を一覧にして、**このタスクでは直さず**、結果を報告する。ページごとに正しい振る舞いが違うため、まとめて直すのは別作業にする。

- [ ] **Step 6: コミット**

```bash
git add "app/plans/[planId]/settlement/page.tsx" tests/settlement-page-query-error.test.tsx
git commit -m "fix: stop the settlement page from reporting query failures as 404"
```

---

### Task 8: 全体の確認

**Files:** なし（検証のみ）

- [ ] **Step 1: テスト全体を通す**

Run: `npm test`
Expected: 全件 PASS。基準線は 154ファイル / 773テスト。今回の追加で **テスト数は 773 + 8 件前後**になる（Task 2 で1件、Task 4 で1件、Task 5 で1件、Task 6 で4件、Task 7 で2件、Task 1 は既存の置き換えで増減なし）。

減っている場合は、どこかでテストを消している。**消したテストは戻す。**

- [ ] **Step 2: lint と型チェックを通す**

Run: `npm run lint`
Expected: エラーなし

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: ビルドを通す**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: 実機確認の観点を報告する**

次を人間が確認する。コードでは検証できない。

- ヘッダーが1段になり、最初のカードがファーストビューに入る
- イベント一覧で FAB が最後のカードに重ならない
- タスク名が潰れずに読める
- チャットで入力してから投稿ボタンまでスクロールが要らない
- **iOS と Android の両方**でキーボードが入力欄を隠さない（iOS は重ね、Android はリサイズするため挙動が違う）

---

## Self-Review

**Spec coverage** — 設計docの7項目それぞれに対応するタスクがある。

| 設計docの項目 | タスク |
|---|---|
| 1. ヘッダーが2段 | Task 1 |
| 2. 未設定で行を浪費 | Task 2 |
| 3. FAB の重なり | Task 3 |
| 4. タスク行の潰れ | Task 4 |
| 5. チャット投稿ボタン | Task 5 |
| 6. 中止イベントの日程調整ボタン | Task 6 |
| 7. `notFound()` がエラーを飲む | Task 7 |

スコープ外（追加UIの `<details>` 化、立替の専用ページ化、複数担当、受け取り方法の複数指定、デスクトップ調整）はタスクを作っていない。意図どおり。

**型の一貫性** — Task 2 で `formatSchedule` の戻り値が `string | null` に変わる。呼び出し側は同じ Task 内の `scheduleText` 経由に統一しており、他のタスクからは参照されない。Task 6 の `canStartDateAdjustment` は Task 6 内で定義・使用が閉じている。

**Task 3 と Task 1 の競合** — どちらも `tests/layout-responsive.test.tsx` と `app/layout.tsx` を触る。Task 1 はヘッダーの `<div>`（47行目）と `flex-col` の期待値、Task 3 は本文コンテナ（61行目）とフッター（67行目）の `pb-28` の期待値で、**行も期待値も重ならない**。順に実行すれば衝突しない。
