# イベント一覧のグループ表示化（案A） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/events` 一覧を「あなたの番／待ち／これから／おわり」の4グループ表示に作り替える。DB migrationなし。

**Architecture:** 既存の `list_owned_event_ids` RPC・events テーブルの select は変更しない。`query.status === "active"`（既定アクセス）だけ新しいグルーピング描画にし、`status=completed/cancelled/draft`（`/events?status=...` を明示指定した深掘りアクセス）は既存の実装をそのまま残す。「おわり」（完了+中止）は既存RPCを `p_filter="completed"` と `p_filter="cancelled"` で2回呼んで合算する別枠クエリで、上限5件・非ページング。

**Tech Stack:** Next.js 15 App Router（Server Component）、Supabase、TypeScript、Vitest + Testing Library、Tailwind。

## Global Constraints

- 日本語UI文言は本計画中の文言をそのまま使う（意訳・言い換えをしない）
- JST基準の日時計算は既存の `lib/shared/format.ts` の `jstFormat`/`jstDateKey`（非export）パターンを踏襲する
- DB migration・`list_owned_event_ids` RPCのSQL変更はしない
- 依頼と無関係なリファクタリング・整形はしない（触っていない既存コードはそのまま）
- 各タスックの最後に `npx vitest run --reporter=dot <対象ファイル>` で GREEN を確認してからコミットする
- コミットメッセージは日本語、`git commit` は都度小さく

---

## Task 1: `getEventListGroup` 純粋関数

**Files:**
- Create: `lib/domain/event/event-list-group.ts`
- Test: `tests/event/event-list-group.test.ts`

**Interfaces:**
- Consumes: `getEventDisplayState`, `type EventListItem`, `type EventListPlan` from `@/lib/domain/event/event-filter`; `shouldShowWrapupPrompt` from `@/lib/domain/event/event-wrapup`; `canAnswerPlan` from `@/lib/domain/plan/availability`
- Produces: `type EventListGroup = "your_turn" | "waiting" | "upcoming" | "done"`, `eventListGroupLabels: Record<EventListGroup, string>`, `type EventListGroupInput`, `getEventListGroup(event: EventListGroupInput, now?: Date): EventListGroup`（Task 5・6で `app/events/page.tsx` が使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/event-list-group.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";

import { eventListGroupLabels, getEventListGroup } from "@/lib/domain/event/event-list-group";

const now = new Date("2026-07-15T12:00:00+09:00");

describe("getEventListGroup", () => {
  it("7つの派生状態をあなたの番／これから／おわりに割り振る", () => {
    const cases = [
      [{ status: "planning", plans: [] }, "your_turn"],
      [{ status: "interested", plans: [] }, "your_turn"],
      [{ status: "done", plans: [{ settlement_status: "needed" }] }, "your_turn"],
      [
        {
          status: "confirmed",
          plans: [
            {
              status: "date_confirmed",
              settlement_status: "not_started",
              confirmed_start_at: "2026-08-01T10:00:00+09:00"
            }
          ]
        },
        "upcoming"
      ],
      [{ status: "done", plans: [{ settlement_status: "settled" }] }, "done"],
      [{ status: "cancelled", plans: [{ settlement_status: "not_started" }] }, "done"]
    ] as const;

    for (const [event, expected] of cases) {
      expect(getEventListGroup(event, now)).toBe(expected);
    }
  });

  it("answer_waiting は回答受付中の候補が残っていれば待ち", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-20T00:00:00+09:00" }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("waiting");
  });

  it("answer_waiting は全ての回答受付が締め切られていればあなたの番", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-01T00:00:00+09:00" }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("your_turn");
  });

  it("answer_waiting で締切未設定の候補が1つでも残っていれば待ち", () => {
    const event = {
      status: "planning",
      plans: [
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: "2026-07-01T00:00:00+09:00" },
        { status: "collecting_answers", settlement_status: "not_started", answer_deadline_at: null }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("waiting");
  });

  it("wrapup対象（開催済み・清算不要・放置）は completed でもあなたの番", () => {
    const longAgo = "2026-01-01T10:00:00+09:00";
    const event = {
      status: "confirmed",
      wrapup_snoozed_until: null,
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: longAgo,
          confirmed_end_at: longAgo,
          is_all_day: false
        }
      ]
    };

    expect(getEventListGroup(event, now)).toBe("your_turn");
  });

  it("ラベルは4種類", () => {
    expect(eventListGroupLabels).toEqual({
      your_turn: "あなたの番",
      waiting: "待ち",
      upcoming: "これから",
      done: "おわり"
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-group.test.ts`
Expected: FAIL（`Cannot find module '@/lib/domain/event/event-list-group'`）

- [ ] **Step 3: 実装を書く**

`lib/domain/event/event-list-group.ts` を新規作成:

```ts
import { canAnswerPlan } from "@/lib/domain/plan/availability";
import { shouldShowWrapupPrompt } from "@/lib/domain/event/event-wrapup";
import { getEventDisplayState, type EventDisplayState, type EventListItem, type EventListPlan } from "@/lib/domain/event/event-filter";

export type EventListGroup = "your_turn" | "waiting" | "upcoming" | "done";

export const eventListGroupLabels: Record<EventListGroup, string> = {
  your_turn: "あなたの番",
  waiting: "待ち",
  upcoming: "これから",
  done: "おわり"
};

export type EventListGroupPlan = EventListPlan & { answer_deadline_at?: string | null };

export type EventListGroupInput = Omit<EventListItem, "plans"> & {
  wrapup_snoozed_until?: string | null;
  plans?: readonly EventListGroupPlan[] | null;
};

const yourTurnDisplayStates = new Set<EventDisplayState>([
  "schedule_creation_waiting",
  "participant_waiting",
  "settlement_waiting"
]);

/**
 * 一覧を「やること」で束ねるためのグループ判定。
 * wrapup対象（開催済み・清算不要で放置され、確認帯が出る段階）は displayState が
 * completed でも「あなたの番」を優先する。
 */
export function getEventListGroup(event: EventListGroupInput, now = new Date()): EventListGroup {
  if (shouldShowWrapupPrompt(event, now)) {
    return "your_turn";
  }

  const displayState = getEventDisplayState(event, now);

  if (yourTurnDisplayStates.has(displayState)) {
    return "your_turn";
  }

  if (displayState === "answer_waiting") {
    const hasOpenAnswerCollection = (event.plans ?? []).some(
      (plan) => plan.status === "collecting_answers" && canAnswerPlan(plan.answer_deadline_at ?? null, now)
    );
    return hasOpenAnswerCollection ? "waiting" : "your_turn";
  }

  if (displayState === "event_waiting") {
    return "upcoming";
  }

  return "done";
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-group.test.ts`
Expected: PASS（7件全て）

- [ ] **Step 5: コミット**

```bash
git add lib/domain/event/event-list-group.ts tests/event/event-list-group.test.ts
git commit -m "$(cat <<'EOF'
feat(events): イベント一覧のグループ判定関数を追加

getEventListGroup が7つの派生状態を「あなたの番/待ち/これから/おわり」に
振り分ける。wrapup対象イベントはcompletedでもあなたの番を優先する。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## Task 2: `formatRelativeEventDate`

**Files:**
- Modify: `lib/shared/format.ts`
- Test: `tests/shared/format.test.ts`

**Interfaces:**
- Consumes: 既存の非export `jstFormat`, `jstDateKey`, `formatTime`, `unsetLabel`（同ファイル内）
- Produces: `formatRelativeEventDate(value: string | null | undefined, now: Date): string`（Task 5で `app/events/page.tsx` が使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/shared/format.test.ts` の import に `formatRelativeEventDate` を追加し、ファイル末尾に describe を追加:

```ts
import {
  formatDate,
  formatDateTime,
  formatDateTimeRange,
  formatDateTimeRangeWithWeekday,
  formatJstTime,
  formatRelativeEventDate,
  formatTime,
  formatYenText,
  toDateTimeLocalValue
} from "@/lib/shared/format";
```

（末尾に追加）

```ts
describe("formatRelativeEventDate", () => {
  const now = new Date("2026-07-01T00:00:00+09:00"); // JST 水曜

  it("今日なら「今日 時刻」", () => {
    expect(formatRelativeEventDate("2026-07-01T19:00:00+09:00", now)).toBe("今日 19:00");
  });

  it("明日なら「明日 時刻」", () => {
    expect(formatRelativeEventDate("2026-07-02T09:30:00+09:00", now)).toBe("明日 09:30");
  });

  it("2〜6日先なら曜日＋時刻", () => {
    expect(formatRelativeEventDate("2026-07-07T19:00:00+09:00", now)).toBe("火 19:00");
  });

  it("7日以上先（同年）なら月/日(曜)＋時刻", () => {
    expect(formatRelativeEventDate("2026-09-20T19:00:00+09:00", now)).toBe("9/20(日) 19:00");
  });

  it("年をまたぐなら年も出す", () => {
    expect(formatRelativeEventDate("2027-01-03T19:00:00+09:00", now)).toBe("2027/1/3(日) 19:00");
  });

  it("未設定なら未設定ラベル", () => {
    expect(formatRelativeEventDate(null, now)).toBe("未設定");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/shared/format.test.ts`
Expected: FAIL（`formatRelativeEventDate is not a function` 等）

- [ ] **Step 3: 実装を書く**

`lib/shared/format.ts` の `formatAllDayRangeWithWeekday` 関数の直後（172行目付近、`toDateInputValue` の手前）に追加:

```ts
function jstDateKeyToUtcMs(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function jstDayDiff(value: string | Date, now: Date): number {
  return Math.round((jstDateKeyToUtcMs(jstDateKey(value)) - jstDateKeyToUtcMs(jstDateKey(now))) / (24 * 60 * 60 * 1000));
}

/**
 * イベント一覧の「これから」グループ用。近い日付ほど曜日感覚で読めるようにする。
 * 今日/明日はラベル、2〜6日先は曜日＋時刻、それ以降は月/日(曜)＋時刻（年をまたげば年も）。
 */
export function formatRelativeEventDate(value: string | null | undefined, now: Date): string {
  if (!value) {
    return unsetLabel;
  }

  const dayDiff = jstDayDiff(value, now);
  const time = formatTime(value);

  if (dayDiff === 0) {
    return `今日 ${time}`;
  }
  if (dayDiff === 1) {
    return `明日 ${time}`;
  }
  if (dayDiff >= 2 && dayDiff <= 6) {
    return `${jstFormat(value, { weekday: "short" })} ${time}`;
  }

  const sameYear = jstFormat(value, { year: "numeric" }) === jstFormat(now, { year: "numeric" });
  const dateParts: Intl.DateTimeFormatOptions = sameYear
    ? { month: "numeric", day: "numeric", weekday: "short" }
    : { year: "numeric", month: "numeric", day: "numeric", weekday: "short" };

  return `${jstFormat(value, dateParts)} ${time}`;
}
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/shared/format.test.ts`
Expected: PASS。日本語ロケールの区切り文字が想定と違えば（例: `9/20(日)` ではなく別表記）、実際の出力に合わせてテストの期待値を直す。

- [ ] **Step 5: コミット**

```bash
git add lib/shared/format.ts tests/shared/format.test.ts
git commit -m "$(cat <<'EOF'
feat(format): 相対日付フォーマッタ formatRelativeEventDate を追加

イベント一覧「これから」グループ用。今日/明日/曜日/月日(曜)を
近さに応じて出し分ける。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## Task 3: コントロールをグループ表示モードと深掘りモードに分岐

**Files:**
- Modify: `components/event/event-list-controls.tsx`
- Modify: `tests/event/event-list-controls.test.tsx`

**Interfaces:**
- Consumes: 既存の `EventListQuery` 等（変更なし）
- Produces: `EventListControls` の外部インターフェースは変更なし（props同じ）。`query.status === "active"` のときだけ状態タブ・進行状態チップを描画しない。

- [ ] **Step 1: 失敗するテストを書く（既存テストの修正＋追加）**

`tests/event/event-list-controls.test.tsx` を編集する。

1つ目、`"状態はチップで出し、押すと1ページ目に戻る"` を置き換え:

```tsx
  it("状態はチップで出し、押すと1ページ目に戻る", () => {
    render(
      <EventListControls
        query={{ status: "completed", category: "all", sort: "soonest", pageSize: 10, page: 3, search: "", displayState: "all" }}
        draftCount={2}
        pagination={{ ...basePagination, page: 3, totalItems: 46, totalPages: 5, from: 21, to: 30 }}
      />
    );

    const chips = screen.getByRole("navigation", { name: "状態で絞り込む" });
    expect(within(chips).getByRole("link", { name: "完了" })).toHaveAttribute("aria-current", "page");
    // 3ページ目のまま状態だけ変えると、件数が足りず空振りする
    expect(within(chips).getByRole("link", { name: "進行中" })).toHaveAttribute("href", "/events");
    expect(within(chips).getByRole("link", { name: "中止" })).toHaveAttribute("href", "/events?status=cancelled");
  });
```

2つ目、`"下書きの件数はチップに出る"` の `query.status` を `"completed"` に変更（他は同じ）:

```tsx
  it("下書きの件数はチップに出る", () => {
    render(
      <EventListControls
        query={{ status: "completed", category: "all", sort: "soonest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={2}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き 2" })).toHaveAttribute("href", "/events?status=draft");
  });
```

3つ目、`"下書きが0件なら数字を出さない"` の `query.status` を `"completed"` に変更:

```tsx
  it("下書きが0件なら数字を出さない", () => {
    render(
      <EventListControls
        query={{ status: "completed", category: "all", sort: "newest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    expect(screen.getByRole("link", { name: "下書き" })).toBeInTheDocument();
  });
```

`"検索欄は『検索・並び替え』の折りたたみに入れる"` の最後のアサーションを置き換え:

```tsx
    // グループ表示（active）では状態タブそのものを出さない
    expect(screen.queryByRole("navigation", { name: "状態で絞り込む" })).not.toBeInTheDocument();
```
（`expect(screen.getByRole("navigation", { name: "状態で絞り込む" }).closest("details")).toBeNull();` の行を上記に差し替え）

`"状態のチップは検索語を保ったまま切り替える"` を置き換え:

```tsx
  it("状態のチップは検索語を保ったまま切り替える", () => {
    render(
      <EventListControls
        query={{ status: "cancelled", category: "all", sort: "soonest", pageSize: 10, page: 1, search: "沖縄", displayState: "all" }}
        draftCount={0}
        pagination={basePagination}
      />
    );

    const chips = screen.getByRole("navigation", { name: "状態で絞り込む" });
    expect(within(chips).getByRole("link", { name: "完了" })).toHaveAttribute(
      "href",
      "/events?status=completed&search=%E6%B2%96%E7%B8%84"
    );
  });
```

`"上段の状態チップを押すと進行状態は all に戻る"` を置き換え:

```tsx
  it("上段の状態チップを押すと進行状態は all に戻る", () => {
    render(
      <EventListControls
        query={{
          status: "cancelled",
          category: "all",
          sort: "soonest",
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
    expect(within(statusNav).getByRole("link", { name: "完了" })).toHaveAttribute("href", "/events?status=completed");
  });
```

`"status=active のとき進行状態の2段目チップが出る"` と `"選択中の進行状態チップに aria-current が付く"` の2つの `it` ブロックを丸ごと削除し、代わりに次の1つを追加（削除した2つがあった位置、`"status=completed のとき2段目チップは出ない"` の直前）:

```tsx
  it("グループ表示（status=active）では状態タブ・進行状態チップを出さない", () => {
    render(
      <EventListControls
        query={{ status: "active", category: "all", sort: "soonest", pageSize: 10, page: 1, search: "", displayState: "all" }}
        draftCount={2}
        pagination={basePagination}
      />
    );

    expect(screen.queryByRole("navigation", { name: "状態で絞り込む" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "進行状態で絞り込む" })).not.toBeInTheDocument();
  });
```

`"status=completed のとき2段目チップは出ない"` はそのまま残す（変更なし）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: FAIL（新しい `"グループ表示（status=active）では..."` は既存実装がまだチップを出すので通らない。他は既存実装のままなら通るはずだが、実装より先にテストを直したのでこの時点では一部PASSも混在してよい — 次のStepで実装を直してから最終確認する）

- [ ] **Step 3: 実装を書く**

`components/event/event-list-controls.tsx` を編集する。

状態タブの `<nav aria-label="状態で絞り込む">...</nav>` ブロック（"nav aria-label="状態で絞り込む"" から対応する `</nav>` まで）を、`{query.status !== "active" ? (...) : null}` で包む:

```tsx
        {query.status !== "active" ? (
          <nav aria-label="状態で絞り込む" className="-mx-4 min-w-0 overflow-x-auto px-4">
            <ul className="flex w-max gap-2">
              {statusOrder.map((status) => {
                const isCurrent = query.status === status;
                const count = status === "draft" ? draftCount : null;
                return (
                  <li key={status}>
                    <Link
                      href={buildEventListHref({ ...query, status, displayState: "all" }, 1)}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 ${
                        isCurrent
                          ? "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white"
                          : "border-line-strong bg-surface text-ink hover:border-moss hover:text-pine"
                      }`}
                    >
                      {statusLabels[status]}
                      {count !== null && count > 0 ? (
                        <span className={`tabular-nums ${isCurrent ? "text-white/75" : "text-muted"}`}>{count}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
```

進行状態チップのブロック（`{query.status === "active" ? (` から対応する `) : null}` まで、`<div className="grid gap-1.5">...</div>` を含む）を**丸ごと削除**する（active では今後never trueになるため）。

ファイル冒頭の import から `EVENT_LIST_PROGRESS_STATES` と `eventDisplayStateLabels` を削除し、これらのみを使っていた `progressChipClass` 関数も削除する:

```tsx
import {
  buildEventListHref,
  EVENT_LIST_PAGE_SIZES,
  EVENT_SEARCH_MAX_LENGTH,
  type EventListFilter,
  type EventListPagination,
  type EventListQuery,
  type EventListSort
} from "@/lib/domain/event/event-filter";
```

（`progressChipClass` 関数定義ごと削除）

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: PASS（21件 → 20件、削除2件＋追加1件で正味-1）

- [ ] **Step 5: コミット**

```bash
git add components/event/event-list-controls.tsx tests/event/event-list-controls.test.tsx
git commit -m "$(cat <<'EOF'
refactor(events): グループ表示（active）では状態タブ・進行状態チップを出さない

status=completed/cancelled/draft の深掘り表示では既存の状態タブUIを
そのまま残す。進行状態チップはactive専用だったため実質不要になり削除。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## Task 4: 下書きカードの常時表示

**Files:**
- Modify: `app/events/page.tsx`
- Modify: `tests/event/events-page.test.tsx`

**Interfaces:**
- Consumes: 既存の `eventDraft`, `draftPayload`, `draftCategory`（既に計算済み、変更なし）
- Produces: `DraftCard({ payload, category }: { payload: EventDraftPayload; category: EventCategoryFilter })` コンポーネント（Task 5・6でも同じものを使う）。`pinnedDraft` 変数（`status !== "draft"` なら `eventDraft`、そうでなければ `null`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/events-page.test.tsx` の `"shows active events by default and exposes the saved draft count"`（74行目付近）を置き換え:

```tsx
  it("shows active events by default and shows the pinned draft card", async () => {
    const eventQuery = createEventQuery([makeEvent("event-1", "夏ライブ")]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    // 下書きは状態タブが無くなった分、常時カードとして先頭に出る
    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toHaveAttribute("href", "/events/new?resume=draft");
    expect(screen.getByRole("heading", { name: "夏ライブ" })).toBeInTheDocument();
  });
```

同ファイルに新規テストを追加（`"shows the saved draft instead of querying event rows when draft is selected"` の直後）:

```tsx
  it("下書きは完了タブでも常時先頭に表示される", async () => {
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "完了イベント"), status: "done" }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery({
      id: "draft-1",
      payload: { title: "入力途中の旅行", category: "travel" },
      updated_at: "2026-07-15T00:00:00Z"
    });
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

    expect(screen.getByRole("link", { name: /入力途中の旅行/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "完了イベント" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx -t "pinned draft|完了タブでも常時"`
Expected: FAIL（下書きカードが `status=draft` のとき以外は出ていない）

- [ ] **Step 3: 実装を書く**

`app/events/page.tsx` を編集する。

`EventCategoryFilter` 型を import に追加:

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
  type EventCategoryFilter,
  type EventDisplayState,
  type EventListItem
} from "@/lib/domain/event/event-filter";
```

`visibleDraft` の直後（117〜125行目のあと）に `pinnedDraft` を追加:

```tsx
  const visibleDraft =
    query.status === "draft" &&
    eventDraft &&
    (query.category === "all" || query.category === draftCategory) &&
    eventMatchesSearch({ title: draftPayload.title, location_name: draftPayload.location_name }, query.search)
      ? eventDraft
      : null;
  // フィルタ条件に関係なく、下書きがあれば常に一覧の先頭に出す（grill-meで確定）
  const pinnedDraft = query.status !== "draft" ? eventDraft : null;
```

`EventCard` 関数の直前に `DraftCard` を追加し、既存の `visibleDraft` レンダリング（185〜208行目の `<Card>...</Card>` 部分）をそれに差し替える。まず `DraftCard` を追加:

```tsx
function DraftCard({ payload, category }: { payload: EventDraftPayload; category: EventCategoryFilter }) {
  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={getEventDraftResumePath()} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3">
              <Badge tone="info">下書き</Badge>
            </div>
            <h2 className="text-xl font-bold text-ink">
              {typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "タイトル未入力のイベント"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {typeof payload.location_name === "string" && payload.location_name.trim()
                ? payload.location_name.trim()
                : "場所メモ未設定"}
            </p>
          </div>
          <Badge tone="done">{category === "all" ? "カテゴリ未設定" : categoryLabels[category]}</Badge>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-sm font-bold text-pine">続きから入力</p>
      </Link>
    </Card>
  );
}
```

`EventsPage` の return 部分を書き換え:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベント一覧" />
      <EventListControls query={displayQuery} draftCount={draftCount} pagination={pagination} />
      {visibleDraft ? (
        <DraftCard payload={draftPayload} category={draftCategory} />
      ) : (
        <div className="space-y-6">
          {pinnedDraft ? <DraftCard payload={draftPayload} category={draftCategory} /> : null}
          {eventRows.length > 0 ? (
            <div className="grid gap-4">
              {eventRows.map((event) => (
                <EventCard key={event.id} event={event} showCancel={query.status === "active"} />
              ))}
            </div>
          ) : !pinnedDraft ? (
            <EmptyState>
              {query.search
                ? `「${query.search}」に一致するイベントはありません。別の言葉で探すか、絞り込みを変えてみてください。`
                : "条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。"}
            </EmptyState>
          ) : null}
        </div>
      )}
    </div>
  );
```

（この段階ではまだグルーピングを入れず、Task 5・6のための土台だけ作る。`isGrouped` を使ったグルーピング描画は次タスクで `eventRows.length > 0` の分岐の中身を置き換える）

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx`
Expected: 一部FAIL継続（Task 5・6で直す、L94/L123/L147/L188/L241のカード内容系テストはまだ壊れたまま）。新規2件と修正した1件（下書き系）はPASSすること、`-t "pinned draft|完了タブでも常時|shows the saved draft instead"` で確認する。

- [ ] **Step 5: コミット**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(events): 下書きカードをフィルタ条件に関係なく常時先頭表示

状態タブが無くなる分、下書きは自分専用の固定カードとして
常に一覧の先頭に出す。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## Task 5: グループ描画（あなたの番／待ち／これから）とコンパクトカード

**Files:**
- Modify: `app/events/page.tsx`
- Modify: `tests/event/events-page.test.tsx`

**Interfaces:**
- Consumes: `getEventListGroup`, `eventListGroupLabels`, `type EventListGroup`（Task 1）、`formatRelativeEventDate`（Task 2）
- Produces: `GroupedEventCard`, `GroupSection`, `groupedCardActionLine`（page.tsx内のローカル関数、Task 6でも使う）。`EventRow.plans` の要素型に `answer_deadline_at: string | null` を追加

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/events-page.test.tsx` の以下4つの `it` ブロックを置き換える。

`"shows one concrete state and keeps the event card concise"`（94行目付近）を置き換え:

```tsx
  it("あなたの番グループにはアクション文言だけを出し、場所・参加人数は出さない", async () => {
    const eventQuery = createEventQuery([{
      ...makeEvent("event-1", "週末の謎解き会"),
      category: "nazotoki",
      status: "interested",
      location_name: "新宿",
      event_members: [{ status: "joined" }],
      plans: []
    }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("あなたの番")).toBeInTheDocument();
    const eventCardLink = screen.getByRole("link", { name: /週末の謎解き会/ });
    expect(within(eventCardLink).getByText("▶ 日程調整を始める")).toBeInTheDocument();
    expect(within(eventCardLink).queryByText("新宿")).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText(/参加 \d+人/)).not.toBeInTheDocument();
    expect(within(eventCardLink).queryByText("参加者待ち")).not.toBeInTheDocument();
  });
```

`"colors each event card's badge by category"`（123行目付近）を置き換え:

```tsx
  it("カードの左端はカテゴリの色ドットのみで、テキストラベルは出さない", async () => {
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "夏合宿"), category: "travel" }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    const cardLink = screen.getByRole("link", { name: /夏合宿/ });
    expect(within(cardLink).queryByText("旅行")).not.toBeInTheDocument();
    const dot = cardLink.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass("bg-category-travel");
  });
```

`"colors settlement_waiting, completed, and cancelled with visibly different tones"`（147行目付近）を削除し、代わりに次の1件を追加:

```tsx
  it("清算待ちイベントはあなたの番グループに入る", async () => {
    const pastPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "needed",
      confirmed_start_at: "2020-01-01T00:00:00Z",
      confirmed_end_at: "2020-01-01T00:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([{ ...makeEvent("event-1", "清算待ちイベント"), plans: [pastPlan] }]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("あなたの番")).toBeInTheDocument();
    const cardLink = screen.getByRole("link", { name: /清算待ちイベント/ });
    expect(within(cardLink).getByText("¥ 清算をまとめる")).toBeInTheDocument();
  });
```

`"確定済みイベントのカードは日時を曜日つきで出す（一覧は日付見出しが無い）"`（188行目付近）を置き換え:

```tsx
  it("これからグループのカードは相対日付で出す", async () => {
    const confirmedPlan = {
      id: "plan-1",
      status: "date_confirmed",
      settlement_status: "not_started",
      confirmed_start_at: "2026-07-07T10:00:00Z", // JST 2026/07/07 19:00, vitest.setup の now=2026-07-01 の6日後（火）
      confirmed_end_at: "2026-07-07T12:00:00Z",
      is_all_day: false
    };
    const eventQuery = createEventQuery([
      { ...makeEvent("event-1", "確定済みの集まり"), status: "confirmed", plans: [confirmedPlan] }
    ]);
    const rpc = createRpcResult(["event-1"], 1);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("これから")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /確定済みの集まり/ });
    expect(within(card).getByText("火 19:00")).toBeInTheDocument();
  });
```

`"omits the schedule and location rows when they are unset"`（241行目付近）を置き換え:

```tsx
  it("日程が未設定でも「あなたの番」のアクション文言だけを出す", async () => {
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

    expect(screen.queryByText("参加 1人")).not.toBeInTheDocument();
    const cardLink = screen.getByRole("link", { name: /まだ何も決まっていない会/ });
    expect(within(cardLink).getByText("▶ 日程調整を始める")).toBeInTheDocument();
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx`
Expected: 上記5件がFAIL（グループ見出し・アクション文言がまだ描画されていない）

- [ ] **Step 3: 実装を書く**

`app/events/page.tsx` を編集する。

import に追加（`getEventLastScheduleTimestamp` はTask 6で使うのでここで一緒に追加してよい）:

```tsx
import { ChevronRight, CalendarDays, MapPin, UsersRound } from "lucide-react";
import { getEventListGroup, eventListGroupLabels, type EventListGroup } from "@/lib/domain/event/event-list-group";
import { formatDate, formatDateTimeRangeWithWeekday, formatRelativeEventDate } from "@/lib/shared/format";
import { categoryAccent } from "@/lib/domain/event/category-color";
```

（`categoryAccent` は既に import 済みなら重複させない。`lucide-react` の import 行は既存の `CalendarDays, MapPin, UsersRound` に `ChevronRight` を追加する形にする）

`EventRow` 型の `plans` 要素に `answer_deadline_at` を追加:

```tsx
  plans: Array<{
    id: string;
    status: string;
    settlement_status: string;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    is_all_day: boolean | null;
    answer_deadline_at: string | null;
  }> | null;
```

events select に `answer_deadline_at` を追加:

```tsx
        .select(
          "id, title, category, start_date, end_date, location_name, status, created_at, wrapup_snoozed_until, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day, answer_deadline_at)"
        )
```

`const isGrouped = query.status === "active";` を `query` 計算のあと（`normalizeEventListQuery` の直後あたり）に追加。

`EventCard` 関数の後ろに、グループ用のヘルパーを追加:

```tsx
const groupActionLabels: Partial<Record<EventDisplayState, string>> = {
  schedule_creation_waiting: "＋ 日程の候補をつくる",
  participant_waiting: "▶ 日程調整を始める",
  settlement_waiting: "¥ 清算をまとめる"
};

function groupedCardActionLine(
  event: EventRow,
  group: EventListGroup,
  summary: ReturnType<typeof getEventCardSummary>,
  isWrapup: boolean
): string {
  if (isWrapup) {
    return "✓ 完了か確認する";
  }
  if (group === "your_turn") {
    if (summary.displayState === "answer_waiting") {
      return "✎ 回答を締めて日程を確定する";
    }
    return groupActionLabels[summary.displayState] ?? "";
  }
  if (group === "waiting") {
    return "回答受付中";
  }
  if (group === "upcoming") {
    return summary.schedule.startAt ? formatRelativeEventDate(summary.schedule.startAt, new Date()) : "";
  }
  if (event.status === "cancelled") {
    return "中止";
  }
  return summary.schedule.startAt ? formatDate(summary.schedule.startAt) : "開催日未設定";
}

function GroupedEventCard({ event, group }: { event: EventRow; group: EventListGroup }) {
  const summary = getEventCardSummary(event);
  const normalizedCategory = normalizeCategory(event.category);
  const category = normalizedCategory === "all" ? "other" : normalizedCategory;
  const accent = categoryAccent(category);
  const isWrapup = shouldShowWrapupPrompt(event);
  const line = groupedCardActionLine(event, group, summary, isWrapup);

  return (
    <Card className="transition-colors hover:border-moss/45">
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={clsx("mt-2 h-2 w-2 shrink-0 rounded-full", accent.dot)} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-ink">{event.title}</h2>
            {line ? <p className="mt-1 text-sm text-muted">{line}</p> : null}
          </div>
          <ChevronRight aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted" />
        </div>
      </Link>
      {isWrapup ? (
        <EventWrapupActions
          completeAction={completeEventAction.bind(null, event.id)}
          snoozeAction={snoozeEventWrapupAction.bind(null, event.id)}
        />
      ) : null}
      {!isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}

function GroupSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-eyebrow uppercase text-muted">
        <span>{title}</span>
        <span className="tabular-nums">{count}</span>
      </p>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

type EventGroupBuckets = { yourTurn: EventRow[]; waiting: EventRow[]; upcoming: EventRow[]; done: EventRow[] };

function bucketEventRows(rows: EventRow[]): EventGroupBuckets {
  const buckets: EventGroupBuckets = { yourTurn: [], waiting: [], upcoming: [], done: [] };
  for (const event of rows) {
    const group = getEventListGroup(event);
    if (group === "your_turn") buckets.yourTurn.push(event);
    else if (group === "waiting") buckets.waiting.push(event);
    else if (group === "upcoming") buckets.upcoming.push(event);
    else buckets.done.push(event);
  }
  return buckets;
}
```

`import { shouldShowWrapupPrompt } from "@/lib/domain/event/event-wrapup";` は既存のまま（変更不要）。`EventDisplayState` 型も既存 import のまま利用する。

`EventsPage` の return 内、Task 4で作った `<div className="space-y-6">...` の中身を書き換える（`eventRows.length > 0` の分岐を `isGrouped` で分ける。「おわり」は次タスクなのでここではまだ入れない）:

```tsx
      {visibleDraft ? (
        <DraftCard payload={draftPayload} category={draftCategory} />
      ) : (
        <div className="space-y-6">
          {pinnedDraft ? <DraftCard payload={draftPayload} category={draftCategory} /> : null}
          {isGrouped ? (
            <>
              {(() => {
                const buckets = bucketEventRows(eventRows);
                return (
                  <>
                    {buckets.yourTurn.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.your_turn} count={buckets.yourTurn.length}>
                        {buckets.yourTurn.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="your_turn" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.waiting.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.waiting} count={buckets.waiting.length}>
                        {buckets.waiting.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="waiting" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.upcoming.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.upcoming} count={buckets.upcoming.length}>
                        {buckets.upcoming.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="upcoming" />
                        ))}
                      </GroupSection>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : eventRows.length > 0 ? (
            <div className="grid gap-4">
              {eventRows.map((event) => (
                <EventCard key={event.id} event={event} showCancel={query.status === "active"} />
              ))}
            </div>
          ) : null}
          {!isGrouped && eventRows.length === 0 && !pinnedDraft ? (
            <EmptyState>
              {query.search
                ? `「${query.search}」に一致するイベントはありません。別の言葉で探すか、絞り込みを変えてみてください。`
                : "条件に合うイベントはありません。絞り込みを変えるか、「イベント作成」から新しく作成してください。"}
            </EmptyState>
          ) : null}
        </div>
      )}
```

（即時関数 `(() => {...})()` は一時的な書き方。Task 6で `doneAll` を混ぜる際にこの部分を素直な変数代入に整理する）

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx`
Expected: Task 4・5で触れたテストはPASS。Task 6未着手分（おわり関連）はまだ書いていないのでこの時点では対象外。

- [ ] **Step 5: コミット**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(events): あなたの番/待ち/これからをグループ表示に

getEventListGroup でメインクエリの1ページ分をバケツ分けし、
カードは1行のアクション文言・相対日付だけを出すコンパクト表示にする。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## Task 6: 「おわり」別枠クエリ（完了+中止合算・上限5件）

**Files:**
- Modify: `app/events/page.tsx`
- Modify: `tests/event/events-page.test.tsx`

**Interfaces:**
- Consumes: `getEventLastScheduleTimestamp` from `@/lib/domain/event/event-filter`（並び替え用）
- Produces: なし（page.tsx内で完結）

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/events-page.test.tsx` の先頭、既存の `makeEvent` 関数の直後に2つのテストヘルパーを追加:

```tsx
function createEventLookupQuery(allEvents: Array<Record<string, unknown>>) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((_column: string, ids: string[]) =>
      Promise.resolve({ data: allEvents.filter((event) => ids.includes(event.id as string)), error: null })
    )
  };
}

function createGroupedRpc(byFilter: Record<string, { ids: string[]; total: number }>) {
  return vi.fn((_name: string, params: { p_filter: string }) => {
    const result = byFilter[params.p_filter] ?? { ids: [], total: 0 };
    return Promise.resolve({ data: [{ event_ids: result.ids, total_count: result.total }], error: null });
  });
}
```

ファイル末尾（`describe("EventsPage", ...)` の最後、`});` の直前）に2つのテストを追加:

```tsx
  it("おわりグループは完了・中止を合算した別枠クエリから出す", async () => {
    const eventQuery = createEventLookupQuery([
      makeEvent("event-1", "調整中の会"),
      { ...makeEvent("done-1", "完了した会1"), status: "done" },
      { ...makeEvent("done-2", "中止した会1"), status: "cancelled" }
    ]);
    const rpc = createGroupedRpc({
      active: { ids: ["event-1"], total: 1 },
      completed: { ids: ["done-1"], total: 1 },
      cancelled: { ids: ["done-2"], total: 1 }
    });
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("おわり")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "調整中の会" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "完了した会1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "中止した会1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "もっと見る" })).not.toBeInTheDocument();
  });

  it("おわりの合計が5件を超えたら「もっと見る」を出す", async () => {
    const doneEvents = Array.from({ length: 5 }, (_, index) => ({
      ...makeEvent(`done-${index}`, `完了した会${index}`),
      status: "done"
    }));
    const eventQuery = createEventLookupQuery(doneEvents);
    const rpc = createGroupedRpc({
      active: { ids: [], total: 0 },
      completed: { ids: doneEvents.map((event) => event.id), total: 6 },
      cancelled: { ids: [], total: 0 }
    });
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "もっと見る" })).toHaveAttribute("href", "/events?status=completed");
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx -t "おわり"`
Expected: FAIL（おわりセクション自体がまだ無い）

- [ ] **Step 3: 実装を書く**

`app/events/page.tsx` を編集する。

import に `getEventLastScheduleTimestamp` を追加:

```tsx
import {
  buildEventListHref,
  eventDisplayStateLabels,
  eventMatchesSearch,
  getEventCardSummary,
  getEventLastScheduleTimestamp,
  getEventListPagination,
  isEventLifecycleFinished,
  normalizeCategory,
  normalizeEventListQuery,
  type EventCategoryFilter,
  type EventDisplayState,
  type EventListItem
} from "@/lib/domain/event/event-filter";
```

`EventsPage` 関数の中、`supabase`/`userId` 確定後・データ取得の前あたりに、`fetchEventRows` を既存の `.in("id", eventIds)` ブロックから切り出す形で追加し、`fetchDoneOverflow` を新設する。既存のメインクエリ内 `if (eventIds.length > 0) { ... }` ブロックを以下のように書き換える:

既存:
```tsx
    if (eventIds.length > 0) {
      const { data: pageRows, error: pageError } = await supabase
        .from("events")
        .select(
          "id, title, category, start_date, end_date, location_name, status, created_at, wrapup_snoozed_until, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day, answer_deadline_at)"
        )
        .in("id", eventIds);
      if (pageError) throw new Error(pageError.message);

      const rowsById = new Map(((pageRows ?? []) as EventRow[]).map((event) => [event.id, event]));
      eventRows = eventIds.flatMap((eventId) => {
        const event = rowsById.get(eventId);
        return event ? [event] : [];
      });
    }
```

置き換え後（`fetchEventRows` をコンポーネント内の関数として使う形に整理）:

```tsx
    if (eventIds.length > 0) {
      eventRows = await fetchEventRows(eventIds);
    }

    if (isGrouped) {
      doneOverflow = await fetchDoneOverflow();
    }
```

これに対応する `fetchEventRows` と `fetchDoneOverflow`、`doneOverflow` の変数宣言を、`let eventRows: EventRow[] = [];` の直後（既存の `let totalItems = visibleDraft ? 1 : 0;` の近く）に追加する:

```tsx
  let eventRows: EventRow[] = [];
  let totalItems = visibleDraft ? 1 : 0;
  let doneOverflow: { events: EventRow[]; totalCount: number } = { events: [], totalCount: 0 };

  const EVENT_ROW_SELECT =
    "id, title, category, start_date, end_date, location_name, status, created_at, wrapup_snoozed_until, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day, answer_deadline_at)";

  async function fetchEventRows(eventIds: string[]): Promise<EventRow[]> {
    const { data: pageRows, error } = await supabase.from("events").select(EVENT_ROW_SELECT).in("id", eventIds);
    if (error) throw new Error(error.message);

    const rowsById = new Map(((pageRows ?? []) as EventRow[]).map((event) => [event.id, event]));
    return eventIds.flatMap((eventId) => {
      const event = rowsById.get(eventId);
      return event ? [event] : [];
    });
  }

  async function fetchDoneOverflow(): Promise<{ events: EventRow[]; totalCount: number }> {
    const DONE_OVERFLOW_LIMIT = 5;
    const filters = ["completed", "cancelled"] as const;
    const results = await Promise.all(
      filters.map((filter) =>
        supabase.rpc("list_owned_event_ids", {
          p_filter: filter,
          p_category: query.category,
          p_sort: "latest",
          p_limit: DONE_OVERFLOW_LIMIT,
          p_offset: 0,
          p_query: query.search || null,
          p_display_state: "all"
        })
      )
    );

    let totalCount = 0;
    const ids: string[] = [];
    for (const { data, error } of results) {
      if (error) throw new Error(error.message);
      const row = (data?.[0] ?? null) as EventListRpcRow | null;
      totalCount += Number(row?.total_count ?? 0);
      ids.push(...(row?.event_ids ?? []));
    }

    if (ids.length === 0) {
      return { events: [], totalCount };
    }

    const rows = await fetchEventRows(ids);
    const sorted = [...rows].sort(
      (left, right) => (getEventLastScheduleTimestamp(right) ?? 0) - (getEventLastScheduleTimestamp(left) ?? 0)
    );
    return { events: sorted.slice(0, DONE_OVERFLOW_LIMIT), totalCount };
  }
```

`isGrouped` の定義は既存（Task 5で追加済み）のものをそのまま使う。

Task 5で仮に即時関数 `(() => {...})()` で書いた描画部分を、`doneAll` を混ぜた形に整理する。`isGrouped` 分岐全体を次のように書き換える:

```tsx
          {isGrouped
            ? (() => {
                const buckets = bucketEventRows(eventRows);
                const doneAll = [...buckets.done, ...doneOverflow.events];
                return (
                  <>
                    {buckets.yourTurn.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.your_turn} count={buckets.yourTurn.length}>
                        {buckets.yourTurn.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="your_turn" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.waiting.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.waiting} count={buckets.waiting.length}>
                        {buckets.waiting.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="waiting" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {buckets.upcoming.length > 0 ? (
                      <GroupSection title={eventListGroupLabels.upcoming} count={buckets.upcoming.length}>
                        {buckets.upcoming.map((event) => (
                          <GroupedEventCard key={event.id} event={event} group="upcoming" />
                        ))}
                      </GroupSection>
                    ) : null}
                    {doneAll.length > 0 ? (
                      <details className="rounded-card border border-line bg-surface">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body [&::-webkit-details-marker]:hidden">
                          <span className="font-bold text-ink">{eventListGroupLabels.done}</span>
                          <span className="tabular-nums text-muted">{doneAll.length}</span>
                          <span aria-hidden="true" className="ml-auto text-muted">
                            ▾
                          </span>
                        </summary>
                        <div className="grid gap-4 border-t border-line p-4">
                          {doneAll.map((event) => (
                            <GroupedEventCard key={event.id} event={event} group="done" />
                          ))}
                          {doneOverflow.totalCount > doneAll.length ? (
                            <Link
                              href="/events?status=completed"
                              className="text-center text-body font-bold text-pine underline-offset-2 hover:underline"
                            >
                              もっと見る
                            </Link>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </>
                );
              })()
            : eventRows.length > 0 ? (
```

（この後ろの `<div className="grid gap-4">...` から `EmptyState` の分岐までは Task 5 の内容をそのまま維持する）

`EmptyState` を出す条件も、「おわり」を含めて全て空のときだけにする。`!isGrouped && eventRows.length === 0 && !pinnedDraft` を、次に置き換える:

```tsx
          {eventRows.length === 0 && !pinnedDraft && (!isGrouped || doneOverflow.events.length === 0) ? (
```

- [ ] **Step 4: テストがGREENになることを確認**

Run: `npx vitest run --reporter=dot tests/event/events-page.test.tsx`
Expected: 全件PASS

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx tests/event/event-list-group.test.ts tests/shared/format.test.ts`
Expected: 全件PASS（Task 1〜3で触れたファイルのデグレが無いことも確認）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー0件

- [ ] **Step 6: コミット**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(events): おわりグループに完了+中止の別枠クエリ（上限5件）を追加

list_owned_event_ids をcompleted/cancelledそれぞれで呼び、
最終開催日が新しい順にマージして上限5件。5件を超えたら
もっと見るで既存の完了タブ（深掘り表示）へ誘導する。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XGsySinJDZErCXdCX7JUhR
EOF
)"
```

---

## 全体の最終確認

- [ ] Run: `npx vitest run --reporter=dot tests/event tests/shared/format.test.ts`
  Expected: 全件PASS
- [ ] Run: `npx tsc --noEmit`
  Expected: エラー0件
- [ ] Run: `npx eslint app/events/page.tsx components/event/event-list-controls.tsx lib/domain/event/event-list-group.ts lib/shared/format.ts`
  Expected: エラー0件
- [ ] 実ブラウザで `/events` を開き、あなたの番・待ち・これから・おわり（折りたたみ）・下書きカード・「もっと見る」→完了タブ遷移を目視確認する（CLAUDE.mdのUI変更ルール）
