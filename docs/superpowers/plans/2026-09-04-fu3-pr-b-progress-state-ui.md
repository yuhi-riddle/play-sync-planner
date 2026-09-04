# FU #3 / PR-B（進行状態フィルタのドメイン＋UI）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント一覧の絞り込みカードに「進行状態」の2段目チップを足し、`list_owned_event_ids` に `p_display_state` を渡す。

**Architecture:** URL パラメータ `display` を `EventListQuery.displayState` に正規化（進行中の内訳5値＋`"all"`、かつ `status==='active'` のときだけ有効）。`buildEventListHref` が持ち回し、`events/page.tsx` が RPC に渡す。UI は絞り込みカード内、状態チップ帯のすぐ下に2段目の帯を出す（`status==='active'` のときだけ）。

**Tech Stack:** Next.js 15 App Router / React 19 / Vitest + Testing Library / Supabase RPC（047 で7引数化済み・本番適用済み）

## Global Constraints

- 前提: **migration 047 は本番適用済み**（`list_owned_event_ids` が7引数）。PR-A（PR #40）マージ済み。
- TDD 必須。テスト先行、RED を実際に確認してから実装。
- 失敗テストをスキップ・削除しない。
- 依頼と無関係なリファクタ・整形をしない。
- `p_display_state` が有効なのは `status==='active'` のときだけ。`completed`/`cancelled`/`draft` のときは常に `'all'`。
- 進行状態の5値と URL 値は文字列一致: `participant_waiting` / `schedule_creation_waiting` / `answer_waiting` / `event_waiting` / `settlement_waiting`。ラベルは `eventDisplayStateLabels` を流用。
- チップに件数バッジは出さない。
- テスト: `npx vitest run --reporter=dot <path>`。
- コミットはタスクごと。メッセージ末尾に
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` と
  `Claude-Session: https://claude.ai/code/session_01CWv6Qmf1S7ujVo4PkKDLDS`。

## 参照

- 設計: `docs/superpowers/specs/2026-09-04-event-list-progress-state-filter-design.md`
- PR-A の計画: `docs/superpowers/plans/2026-09-04-fu3-pr-a-progress-state-rpc.md`
- 既存の絞り込み UI: `components/event/event-list-controls.tsx`（FU #4/#5 で検索統合済み）
- クエリ正規化 / href: `lib/domain/event/event-filter.ts`（`normalizeEventListQuery` L147、`buildEventListHref` L342、`EventListQuery` L54、`EventDisplayState` L11、`eventDisplayStateLabels` L20）
- RPC 呼び出し: `app/events/page.tsx` L127

## File Structure

- `lib/domain/event/event-filter.ts`（修正）— `EVENT_LIST_PROGRESS_STATES` 定数、`EventListQuery.displayState`、`normalizeEventListQuery` / `buildEventListHref`。
- `components/event/event-list-controls.tsx`（修正）— 2段目のチップ帯。
- `app/events/page.tsx`（修正）— `EventFilterQuery` に `display`、RPC 呼び出しに `p_display_state`。
- テスト: `tests/event/event-filter.test.ts` / `tests/event/event-list-controls.test.tsx` / 必要なら `tests/event/events-page.test.tsx`。

---

## Task 1: ドメイン（クエリ正規化と href）

**Files:**
- Modify: `lib/domain/event/event-filter.ts`
- Test: `tests/event/event-filter.test.ts`

**Interfaces:**
- Produces:
  - `EVENT_LIST_PROGRESS_STATES: readonly ["participant_waiting", "schedule_creation_waiting", "answer_waiting", "event_waiting", "settlement_waiting"]`
  - `type EventListProgressState = (typeof EVENT_LIST_PROGRESS_STATES)[number] | "all"`
  - `EventListQuery` に `displayState: EventListProgressState` を追加
  - `normalizeEventListQuery` は `display?: string` を受け、`status==='active'` かつ 5値のいずれかなら採用、それ以外は `"all"`
  - `buildEventListHref` は `displayState !== "all"` のとき `display=<value>` を付ける

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/event-filter.test.ts` に追記（既存の describe 群の末尾）:

```ts
describe("normalizeEventListQuery の displayState", () => {
  it("status=active かつ進行状態が5値のいずれかなら採用する", () => {
    const q = normalizeEventListQuery({ status: "active", display: "answer_waiting" });
    expect(q.displayState).toBe("answer_waiting");
  });

  it("status が active 以外なら display は無視して all", () => {
    expect(normalizeEventListQuery({ status: "completed", display: "answer_waiting" }).displayState).toBe("all");
    expect(normalizeEventListQuery({ status: "draft", display: "answer_waiting" }).displayState).toBe("all");
  });

  it("不正な display 値は all", () => {
    expect(normalizeEventListQuery({ status: "active", display: "nope" }).displayState).toBe("all");
    expect(normalizeEventListQuery({ status: "active" }).displayState).toBe("all");
  });
});

describe("buildEventListHref の display", () => {
  const base = normalizeEventListQuery({ status: "active" });

  it("displayState が all 以外なら display= が付く", () => {
    const href = buildEventListHref({ ...base, displayState: "event_waiting" }, 1);
    expect(href).toBe("/events?display=event_waiting");
  });

  it("displayState が all なら display= は付かない", () => {
    expect(buildEventListHref({ ...base, displayState: "all" }, 1)).toBe("/events");
  });

  it("他の条件と共存する", () => {
    const href = buildEventListHref(
      { ...base, category: "live", sort: "soonest", displayState: "answer_waiting" },
      2
    );
    expect(href).toContain("display=answer_waiting");
    expect(href).toContain("category=live");
    expect(href).toContain("sort=soonest");
    expect(href).toContain("page=2");
  });
});
```

- [ ] **Step 2: RED を確認**

Run: `npx vitest run --reporter=dot tests/event/event-filter.test.ts`
Expected: FAIL（`displayState` プロパティが型に無い／`normalizeEventListQuery` が `display` を見ない）

- [ ] **Step 3: 実装する**

`lib/domain/event/event-filter.ts`:

(a) `EVENT_LIST_SORTS` などの定数の並びに追加:

```ts
export const EVENT_LIST_PROGRESS_STATES = [
  "participant_waiting",
  "schedule_creation_waiting",
  "answer_waiting",
  "event_waiting",
  "settlement_waiting"
] as const;

export type EventListProgressState = (typeof EVENT_LIST_PROGRESS_STATES)[number] | "all";
```

(b) `EventListQuery` 型（L54付近）に1行:

```ts
export type EventListQuery = {
  status: EventListFilter;
  category: EventCategoryFilter;
  sort: EventListSort;
  pageSize: EventListPageSize;
  page: number;
  search: string;
  displayState: EventListProgressState;
};
```

(c) `normalizeEventListQuery`（L147）: 引数の型に `display?: string;` を足し、return に:

```ts
export function normalizeEventListQuery(query: {
  status?: string;
  category?: string;
  sort?: string;
  limit?: string;
  page?: string;
  search?: string;
  display?: string;
}): EventListQuery {
  const pageSize = Number(query.limit);
  const page = Number(query.page);
  const status = EVENT_LIST_FILTERS.includes(query.status as EventListFilter)
    ? (query.status as EventListFilter)
    : "active";
  // 進行状態フィルタは「進行中」の内訳。status が active のときだけ効かせる。
  const displayState: EventListProgressState =
    status === "active" &&
    EVENT_LIST_PROGRESS_STATES.includes(query.display as (typeof EVENT_LIST_PROGRESS_STATES)[number])
      ? (query.display as EventListProgressState)
      : "all";

  return {
    status,
    category: normalizeCategory(query.category),
    sort: EVENT_LIST_SORTS.includes(query.sort as EventListSort) ? (query.sort as EventListSort) : "newest",
    pageSize: EVENT_LIST_PAGE_SIZES.includes(pageSize as EventListPageSize)
      ? (pageSize as EventListPageSize)
      : 10,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    search: normalizeEventSearch(query.search),
    displayState
  };
}
```

(d) `buildEventListHref`（L342）: `if (query.search)` の直後に:

```ts
  if (query.displayState !== "all") {
    params.set("display", query.displayState);
  }
```

- [ ] **Step 4: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/event/event-filter.test.ts`
Expected: PASS（既存＋新規すべて）

> 既存テストで `EventListQuery` を手で組んでいる箇所（`event-list-controls.test.tsx` など）は `displayState` が必須になって型エラーになる。Task 2・3 で直す。ここでは `event-filter.test.ts` の GREEN と `npx tsc --noEmit` の差分だけ確認し、他ファイルの型エラーは次タスクで対応する。

- [ ] **Step 5: コミット**

```bash
git add lib/domain/event/event-filter.ts tests/event/event-filter.test.ts
git commit -m "feat(events): EventListQuery に displayState を足す（進行状態フィルタのURL項目）"
```

---

## Task 2: 2段目のチップ帯（event-list-controls.tsx）

**Files:**
- Modify: `components/event/event-list-controls.tsx`
- Test: `tests/event/event-list-controls.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `EventListQuery.displayState`、`EVENT_LIST_PROGRESS_STATES`、`eventDisplayStateLabels`、`buildEventListHref`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/event-list-controls.test.tsx`。まず既存テストの `query={{ ... }}` リテラルすべてに `displayState: "all"` を足す（型エラー解消）。そのうえで追記:

```ts
  it("status=active のとき進行状態の2段目チップが出る", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "all"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const nav = screen.getByRole("navigation", { name: "進行状態で絞り込む" });
    expect(within(nav).getByRole("link", { name: "回答待ち" })).toHaveAttribute(
      "href",
      "/events?display=answer_waiting"
    );
    expect(within(nav).getByRole("link", { name: "すべて" })).toHaveAttribute("href", "/events");
  });

  it("status=completed のとき2段目チップは出ない", () => {
    render(
      <EventListControls
        query={{
          status: "completed",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "all"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.queryByRole("navigation", { name: "進行状態で絞り込む" })).not.toBeInTheDocument();
  });

  it("選択中の進行状態チップに aria-current が付く", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "event_waiting"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const nav = screen.getByRole("navigation", { name: "進行状態で絞り込む" });
    expect(within(nav).getByRole("link", { name: "開催待ち" })).toHaveAttribute("aria-current", "page");
  });

  it("上段の状態チップを押すと進行状態は all に戻る", () => {
    render(
      <EventListControls
        query={{
          status: "active",
          category: "all",
          sort: "newest",
          pageSize: 10,
          page: 1,
          search: "",
          displayState: "answer_waiting"
        }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const statusNav = screen.getByRole("navigation", { name: "状態で絞り込む" });
    // 完了へ切り替えると display= は落ちる
    expect(within(statusNav).getByRole("link", { name: "完了" })).toHaveAttribute(
      "href",
      "/events?status=completed"
    );
  });
```

- [ ] **Step 2: RED を確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: FAIL（`進行状態で絞り込む` nav が無い／上段チップ href に `display=answer_waiting` が残る）

- [ ] **Step 3: 実装する**

`components/event/event-list-controls.tsx`:

(a) import に `EVENT_LIST_PROGRESS_STATES`, `eventDisplayStateLabels` を足す:

```ts
import {
  buildEventListHref,
  EVENT_LIST_PAGE_SIZES,
  EVENT_LIST_PROGRESS_STATES,
  EVENT_SEARCH_MAX_LENGTH,
  eventDisplayStateLabels,
  type EventListFilter,
  type EventListPagination,
  type EventListQuery,
  type EventListSort
} from "@/lib/domain/event/event-filter";
```

(b) 上段の状態チップの `href` を、進行状態を落とす形に変える:

```tsx
href={buildEventListHref({ ...query, status, displayState: "all" }, 1)}
```

(c) 上段の `</nav>` の直後に2段目を足す:

```tsx
        {query.status === "active" ? (
          <div className="grid gap-1.5">
            <p className="text-caption font-bold text-muted">進行状態</p>
            <nav aria-label="進行状態で絞り込む" className="-mx-4 min-w-0 overflow-x-auto px-4">
              <ul className="flex w-max gap-2">
                <li>
                  <Link
                    href={buildEventListHref({ ...query, displayState: "all" }, 1)}
                    aria-current={query.displayState === "all" ? "page" : undefined}
                    className={progressChipClass(query.displayState === "all")}
                  >
                    すべて
                  </Link>
                </li>
                {EVENT_LIST_PROGRESS_STATES.map((state) => {
                  const isCurrent = query.displayState === state;
                  return (
                    <li key={state}>
                      <Link
                        href={buildEventListHref({ ...query, status: "active", displayState: state }, 1)}
                        aria-current={isCurrent ? "page" : undefined}
                        className={progressChipClass(isCurrent)}
                      >
                        {eventDisplayStateLabels[state]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        ) : null}
```

(d) チップの className を作るヘルパーをファイル冒頭の定数群に足す（上段チップと同じ見た目・少しだけ控えめにするなら `text-caption`）:

```ts
function progressChipClass(isCurrent: boolean) {
  return `inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${
    isCurrent
      ? "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white"
      : "border-line-strong bg-surface text-ink hover:border-moss hover:text-pine"
  }`;
}
```

- [ ] **Step 4: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: PASS（既存＋新規すべて）

- [ ] **Step 5: コミット**

```bash
git add components/event/event-list-controls.tsx tests/event/event-list-controls.test.tsx
git commit -m "feat(events): 絞り込みカードに進行状態の2段目チップを足す"
```

---

## Task 3: page.tsx から RPC に渡す＋仕上げ

**Files:**
- Modify: `app/events/page.tsx`
- Test: `tests/event/events-page.test.tsx`（必要なら）

**Interfaces:**
- Consumes: Task 1 の `normalizeEventListQuery`（`displayState` を返す）。

- [ ] **Step 1: page.tsx を直す**

`app/events/page.tsx`:

(a) `type EventFilterQuery` に `display?: string;` を足す。

(b) `searchParams` の型（`Promise<EventFilterQuery>` 相当）はそのまま。`normalizeEventListQuery((await searchParams) ?? {})` は `display` を拾うようになる（Task 1 で対応済み）。

(c) RPC 呼び出し（L127）に1行:

```tsx
    const { data: rpcRows, error: rpcError } = await supabase.rpc("list_owned_event_ids", {
      p_filter: query.status,
      p_category: query.category,
      p_sort: query.sort,
      p_limit: query.pageSize,
      p_offset: requestedOffset,
      // 空文字ではなく null で渡す。SQL 側は null を「検索していない」として扱う
      p_query: query.search || null,
      p_display_state: query.displayState
    });
```

(d) `displayQuery`（`EventListControls` に渡すやつ）は `{ ...query, page: pagination.page }` なので `displayState` は自動で含まれる。確認だけ。

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（`events-page.test.tsx` が `normalizeEventListQuery` の戻りや `EventListControls` props を手で組んでいたら `displayState` を足す）

- [ ] **Step 3: events-page テストを流す**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx`
Expected: PASS。RPC モックが引数を厳密にアサートしていて落ちたら、`p_display_state` を期待に足す。

- [ ] **Step 4: 全体・lint**

Run: `npx vitest run --reporter=dot`
Expected: すべて PASS

Run: `npx eslint app/events/page.tsx components/event/event-list-controls.tsx lib/domain/event/event-filter.ts`
Expected: エラーなし

- [ ] **Step 5: 実ブラウザ 375px（デプロイ後 or ローカル dev）**

`/events` で:
- 「進行中」選択時に2段目「進行状態」が出る。「回答待ち」タップ → URL に `display=answer_waiting`、一覧が絞られ件数が変わる（seed の `【検証Batch A】調整中・ボードゲーム会` が `answer_waiting`）。
- 「完了」タップ → 2段目が消え、`display=` が URL から落ちる。
- 375px で2段目の帯が横スクロールで収まる。

- [ ] **Step 6: コミット＋PR-B**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "feat(events): 進行状態フィルタを list_owned_event_ids に渡す"
git push -u origin feat/fu3-pr-b-progress-state-ui
gh pr create --draft --base main \
  --title "FU #3 / PR-B: 一覧の進行状態フィルタ（2段目チップ）" \
  --body "設計: docs/superpowers/specs/2026-09-04-event-list-progress-state-filter-design.md

PR-A（migration 047）の続き。047 は本番適用済み。
- event-filter.ts: EventListQuery.displayState（URL パラメータ display）
- event-list-controls.tsx: 絞り込みカードに『進行状態』の2段目チップ（status=active のときだけ）
- page.tsx: p_display_state を RPC に渡す

テスト: 単体＋コンポーネント。実ブラウザ 375px 確認済み。"
```

---

## Self-Review 記録

- 設計 §2（ドメイン）→ Task 1。`display` パラメータ名、`status==='active'` ガード、`buildEventListHref` 反映。
- 設計 §3（2段チップ UI）→ Task 2。`status==='active'` のときだけ・「すべて」チップ・`eventDisplayStateLabels`・件数バッジなし・上段チップで `displayState` リセット。
- 設計 §4（page.tsx）→ Task 3。
- 設計「p_display_state は5値だけ」→ Task 1 の `EVENT_LIST_PROGRESS_STATES` が5値。`completed`/`cancelled` は含めない。
- 型の一貫性: `displayState` / `EventListProgressState` / `EVENT_LIST_PROGRESS_STATES` は Task 1〜3 で一致。`display` URL パラメータ名は Task 1（normalize/href）と設計で一致。
