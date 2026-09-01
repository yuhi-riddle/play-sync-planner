# Batch A / PR-1（ホーム「次の予定」＋ 一覧フィルターの境界）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの「次の予定」を確定が無くても直近の調整中で埋め、イベント一覧の絞り込みをカードで囲って境界をはっきりさせる。

**Architecture:** #1 は「直近1件の選定」を純粋関数 `pickNextUpcoming` に切り出して単体テストし、`app/page.tsx` が確定プラン・調整中候補日をそれぞれ limit 1 で引いて渡す。既存の `findNextConfirmedItem`（表示月バッファ内の確定のみ）は撤去。#2 は `EventListControls` の出力を Madoi のカード面で囲い、検索とカテゴリ/表示順を「検索・並び替え」の折りたたみに入れる（状態チップは表に残す＝比較シートの案イ）。

**Tech Stack:** Next.js 15 App Router / React 19 / Supabase (@supabase/ssr) / Tailwind (Madoi トークン) / Vitest + Testing Library

## Global Constraints

- TDD 必須。実装コードより先にテストを書き、**RED を実際に走らせて確認**してから実装する。
- 失敗テストをスキップ・削除して「解決」にしない。挙動を意図的に変える場合だけテストを書き換え、理由をコミットメッセージに残す。
- 依頼と無関係なリファクタリング・整形をしない。
- 設定ファイル・DB スキーマは変更しない（新しい RPC・マイグレーションを作らない）。
- 「今日」の判定は JST。`lib/shared/jst.ts` の `toJstDateKey` を使う（サーバーは UTC で動くため）。
- 日付整形は `lib/shared/format.ts` の `formatDateTimeRange` を使う。
- 色・余白は `design/tokens.css` のトークン（Tailwind クラス経由）。新しい色を足さない。
- 見た目が変わるタスク（Task 5）は `npm run dev` を実機で開き、**375px 幅とデスクトップ幅の両方**で目視確認してから完了とする。
- テスト実行は `npx vitest run --reporter=dot <path>`。全スイートは最終確認のときだけ。
- コミットはタスクごと。コミットメッセージ末尾に
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` と
  `Claude-Session: https://claude.ai/code/session_01CWv6Qmf1S7ujVo4PkKDLDS` を付ける。

## 参照

- 設計: `docs/superpowers/specs/2026-08-31-home-calendar-list-brushup-design.md`
- 比較シート: `design/proposals/2026-08-31-home-calendar-list-brushup.html`
- 既存の「joined なイベント ID を集める」書き方: `app/plans/page.tsx`（`event_members` → `joinedEventIds` → `hasSupabaseAdminEnv()` なら admin client）

## File Structure

- `lib/domain/home/next-upcoming.ts`（新規）— 純粋関数 `pickNextUpcoming`。ドメインロジックのみ。Supabase を import しない。
- `tests/home/next-upcoming.test.ts`（新規）— 上記の単体テスト。
- `components/home/home-next-upcoming-event-card.tsx`（`home-next-confirmed-event-card.tsx` を git mv）— カード表示。`kind` で確定／調整中を出し分け。
- `tests/home/home-next-upcoming-event-card.test.tsx`（`home-next-confirmed-event-card.test.tsx` を git mv）。
- `lib/domain/home/home-calendar.ts`（修正）— `findNextConfirmedItem` を撤去。
- `tests/home/home-calendar.test.ts`（修正）— `findNextConfirmedItem` の describe を削除。
- `app/page.tsx`（修正）— 直近1件の取得と受け渡し、カードの差し替え。
- `components/event/event-list-controls.tsx`（修正）— カード面で囲う＋「検索・並び替え」折りたたみ。
- `tests/event/event-list-controls.test.tsx`（修正）— 「検索欄は畳まず」系の期待を新設計に合わせる。

---

## Task 1: `pickNextUpcoming` 純粋関数

**Files:**
- Create: `lib/domain/home/next-upcoming.ts`
- Test: `tests/home/next-upcoming.test.ts`

**Interfaces:**
- Consumes: `HomeCalendarItem`（`lib/domain/home/home-calendar.ts` の既存 export。`{ id, kind, title, subtitle?, location?, startAt, endAt?, isAllDay?, href? }`、`kind` は `"collecting" | "confirmed" | "google"`）
- Produces: `pickNextUpcoming(items: HomeCalendarItem[], now: Date): HomeCalendarItem | null`
  - `now` の JST 日付の 0 時以降に始まる項目のうち、
  - `confirmed` が1つでもあれば **その中で最も早いもの**（`collecting` がさらに早くても confirmed を優先）、
  - `confirmed` が無ければ `collecting` の中で最も早いもの、
  - `google` は無視、該当なしは `null`。
  - 同時刻の同 kind が複数なら `id` 昇順で安定させる。

- [ ] **Step 1: 失敗するテストを書く**

`tests/home/next-upcoming.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { pickNextUpcoming } from "@/lib/domain/home/next-upcoming";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const now = new Date("2026-09-02T09:00:00+09:00");

function item(overrides: Partial<HomeCalendarItem> & Pick<HomeCalendarItem, "id" | "kind" | "startAt">): HomeCalendarItem {
  return { title: "会", ...overrides };
}

describe("pickNextUpcoming", () => {
  it("何も無ければ null", () => {
    expect(pickNextUpcoming([], now)).toBeNull();
  });

  it("すべて過去なら null", () => {
    const items = [
      item({ id: "c1", kind: "confirmed", startAt: "2026-09-01T20:00:00+09:00" }),
      item({ id: "a1", kind: "collecting", startAt: "2026-08-30T20:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)).toBeNull();
  });

  it("今日以降の確定があれば、調整中がもっと早くても確定を返す", () => {
    const items = [
      item({ id: "a1", kind: "collecting", startAt: "2026-09-03T19:00:00+09:00" }),
      item({ id: "c1", kind: "confirmed", startAt: "2026-09-20T13:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("c1");
  });

  it("確定が複数なら最も早いもの", () => {
    const items = [
      item({ id: "c-late", kind: "confirmed", startAt: "2026-10-01T13:00:00+09:00" }),
      item({ id: "c-soon", kind: "confirmed", startAt: "2026-09-10T13:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("c-soon");
  });

  it("確定が無ければ調整中の最も早いもの（何ヶ月先でも）", () => {
    const items = [
      item({ id: "a-late", kind: "collecting", startAt: "2026-12-01T19:00:00+09:00" }),
      item({ id: "a-soon", kind: "collecting", startAt: "2026-11-15T19:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("a-soon");
  });

  it("google は無視する", () => {
    const items = [
      item({ id: "g1", kind: "google", startAt: "2026-09-02T10:00:00+09:00" }),
      item({ id: "a1", kind: "collecting", startAt: "2026-09-05T19:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("a1");
  });

  it("今日ちょうど始まる項目は対象に含む", () => {
    const items = [item({ id: "c1", kind: "confirmed", startAt: "2026-09-02T08:00:00+09:00" })];
    expect(pickNextUpcoming(items, now)?.id).toBe("c1");
  });
});
```

- [ ] **Step 2: RED を確認**

Run: `npx vitest run --reporter=dot tests/home/next-upcoming.test.ts`
Expected: FAIL（`pickNextUpcoming` が存在しない）

- [ ] **Step 3: 実装を書く**

`lib/domain/home/next-upcoming.ts`:

```ts
import type { HomeCalendarItem, HomeCalendarItemKind } from "@/lib/domain/home/home-calendar";

/** JST の当日 0 時。now は絶対時刻なので JST に直してから日付境界を取る。 */
function jstStartOfToday(now: Date): number {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000;
}

function sortByStart(items: HomeCalendarItem[]): HomeCalendarItem[] {
  return [...items].sort((left, right) => {
    const diff = new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
    return diff !== 0 ? diff : left.id.localeCompare(right.id);
  });
}

/**
 * ホームの「次の予定」に出す1件を選ぶ。
 * 確定を最優先し、無ければ調整中の最も近いもの。google は対象外。
 */
export function pickNextUpcoming(items: HomeCalendarItem[], now: Date): HomeCalendarItem | null {
  const floor = jstStartOfToday(now);
  const upcoming = items.filter((item) => new Date(item.startAt).getTime() >= floor);

  const byKind = (kind: HomeCalendarItemKind) => sortByStart(upcoming.filter((item) => item.kind === kind));

  return byKind("confirmed")[0] ?? byKind("collecting")[0] ?? null;
}
```

- [ ] **Step 4: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/home/next-upcoming.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add lib/domain/home/next-upcoming.ts tests/home/next-upcoming.test.ts
git commit -m "feat(home): pickNextUpcoming — 確定優先・無ければ直近の調整中"
```

---

## Task 2: カードを `kind` で出し分ける

**Files:**
- Rename: `components/home/home-next-confirmed-event-card.tsx` → `components/home/home-next-upcoming-event-card.tsx`
- Rename: `tests/home/home-next-confirmed-event-card.test.tsx` → `tests/home/home-next-upcoming-event-card.test.tsx`
- Modify: 両ファイルの中身

**Interfaces:**
- Consumes: `pickNextUpcoming` の戻り値（`HomeCalendarItem`）
- Produces: `HomeNextUpcomingEventCard({ item }: { item: HomeCalendarItem })`
  - `item.kind === "collecting"` → バッジ文言「調整中」（tone `info`）、リンク文言「日程を確認する」
  - それ以外（`confirmed`）→ バッジ文言「確定済み」（tone `done`）、リンク文言「詳細を見る」
  - カード上部のラベルは常に「次の予定」

- [ ] **Step 1: ファイルを git mv**

```bash
git mv components/home/home-next-confirmed-event-card.tsx components/home/home-next-upcoming-event-card.tsx
git mv tests/home/home-next-confirmed-event-card.test.tsx tests/home/home-next-upcoming-event-card.test.tsx
```

- [ ] **Step 2: 失敗するテストに書き換える**

`tests/home/home-next-upcoming-event-card.test.tsx` を全置換:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeNextUpcomingEventCard } from "@/components/home/home-next-upcoming-event-card";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const confirmedItem: HomeCalendarItem = {
  id: "confirmed-1",
  kind: "confirmed",
  title: "夏祭り",
  location: "代々木公園",
  startAt: "2026-07-26T18:00:00+09:00",
  endAt: "2026-07-26T20:00:00+09:00",
  href: "/plans/plan-1"
};

const collectingItem: HomeCalendarItem = {
  id: "candidate-1",
  kind: "collecting",
  title: "謎解き公演フォローアップ",
  location: "渋谷",
  startAt: "2026-09-14T19:00:00+09:00",
  endAt: "2026-09-14T21:00:00+09:00",
  href: "/plans/plan-2"
};

describe("HomeNextUpcomingEventCard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("確定は『確定済み』バッジと『詳細を見る』リンクを出す", () => {
    render(<HomeNextUpcomingEventCard item={confirmedItem} />);

    expect(screen.getByText("次の予定")).toBeInTheDocument();
    expect(screen.getByText("夏祭り")).toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText("代々木公園")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "詳細を見る" })).toHaveAttribute("href", "/plans/plan-1");
  });

  it("調整中は『調整中』バッジと『日程を確認する』リンクを出す", () => {
    render(<HomeNextUpcomingEventCard item={collectingItem} />);

    expect(screen.getByText("次の予定")).toBeInTheDocument();
    expect(screen.getByText("謎解き公演フォローアップ")).toBeInTheDocument();
    expect(screen.getByText("調整中")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "日程を確認する" })).toHaveAttribute("href", "/plans/plan-2");
  });

  it("location が無ければ場所の行を出さない", () => {
    render(<HomeNextUpcomingEventCard item={{ ...confirmedItem, location: null }} />);

    expect(screen.queryByText("代々木公園")).not.toBeInTheDocument();
  });

  it("href が無ければリンクを出さない", () => {
    render(<HomeNextUpcomingEventCard item={{ ...confirmedItem, href: undefined }} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("夏祭り")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED を確認**

Run: `npx vitest run --reporter=dot tests/home/home-next-upcoming-event-card.test.tsx`
Expected: FAIL（`HomeNextUpcomingEventCard` が未 export／「調整中」が出ない）

- [ ] **Step 4: 実装を書く**

`components/home/home-next-upcoming-event-card.tsx` を全置換:

```tsx
import { MapPin } from "lucide-react";

import { Badge, Card, SecondaryLink } from "@/components/ui";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import { formatDateTimeRange } from "@/lib/shared/format";

export function HomeNextUpcomingEventCard({ item }: { item: HomeCalendarItem }) {
  const isCollecting = item.kind === "collecting";
  const badgeTone = isCollecting ? "info" : "done";
  const badgeLabel = isCollecting ? "調整中" : "確定済み";
  const linkLabel = isCollecting ? "日程を確認する" : "詳細を見る";

  return (
    <Card aria-label="次の予定">
      <p className="text-eyebrow uppercase text-pine">次の予定</p>
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badgeTone} dot>
            {badgeLabel}
          </Badge>
          <span className="text-body font-bold tabular-nums text-pine">
            {formatDateTimeRange(item.startAt, item.endAt, Boolean(item.isAllDay))}
          </span>
        </div>
        <p className="mt-2 text-title text-ink">{item.title}</p>
        {item.location ? (
          <p className="mt-2 inline-flex items-center gap-1 text-caption text-muted">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            {item.location}
          </p>
        ) : null}
      </div>
      {item.href ? (
        <div className="mt-4">
          <SecondaryLink href={item.href}>{linkLabel}</SecondaryLink>
        </div>
      ) : null}
    </Card>
  );
}
```

> 確認: `Badge` の `tone` に `"info"` があること（`components/home/home-selected-date-agenda.tsx` の `itemBadge` が collecting に `tone: "info"` を使っている）。無ければ `components/ui` の Badge 実装を見て正しい tone 名に合わせる。`SecondaryLink` が子テキストをそのまま出すことも確認する。

- [ ] **Step 5: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/home/home-next-upcoming-event-card.test.tsx`
Expected: PASS（4件）

- [ ] **Step 6: コミット**

```bash
git add components/home/home-next-upcoming-event-card.tsx tests/home/home-next-upcoming-event-card.test.tsx
git commit -m "feat(home): 次の予定カードを確定/調整中で出し分け・リネーム"
```

---

## Task 3: `app/page.tsx` で直近1件を引いて渡す

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `pickNextUpcoming`（Task 1）、`HomeNextUpcomingEventCard`（Task 2）
- Produces: なし（ページ）

このタスクは Supabase クエリの結線で、単体テストが割に合わない。**型チェックと実ブラウザ確認**で担保する。

- [ ] **Step 1: import を差し替える**

`app/page.tsx` 冒頭:

- 削除: `import { HomeNextConfirmedEventCard } from "@/components/home/home-next-confirmed-event-card";`
- 削除: `import { findNextConfirmedItem, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";`
- 追加:

```tsx
import { HomeNextUpcomingEventCard } from "@/components/home/home-next-upcoming-event-card";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";
import { pickNextUpcoming } from "@/lib/domain/home/next-upcoming";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getCurrentUser,
  hasSupabaseAdminEnv,
  hasSupabaseEnv
} from "@/lib/supabase/server";
```

（`createSupabaseAdminClient` / `hasSupabaseAdminEnv` を既存の import 行に足す。他はそのまま）

- [ ] **Step 2: 直近1件の取得を足す**

`HomePage` 内、`const user = await getCurrentUser();` と未ログイン分岐のあと、`calendarPromise` を組む前あたりに追加:

```tsx
  // 「次の予定」用。list_calendar_items は当月＋翌週までしか返さないので、
  // 数ヶ月先の予定を拾うために plans を直接引く（app/plans/page.tsx と同じ作法）。
  const { data: memberships } = await supabase
    .from("event_members")
    .select("event_id")
    .eq("user_id", user.id)
    .eq("status", "joined");
  const joinedEventIds = [...new Set((memberships ?? []).map((row) => row.event_id))];
  const nextUpcomingClient = hasSupabaseAdminEnv() ? createSupabaseAdminClient() : supabase;
  const nowIso = new Date().toISOString();

  type NextPlanRow = {
    id: string;
    title: string | null;
    is_all_day: boolean | null;
    confirmed_start_at: string | null;
    confirmed_end_at: string | null;
    events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
  };
  type NextCandidateRow = {
    id: string;
    start_at: string;
    end_at: string | null;
    is_all_day: boolean | null;
    plans: {
      id: string;
      title: string | null;
      events: { title: string | null; location_name: string | null } | { title: string | null; location_name: string | null }[] | null;
    } | null;
  };

  const nextConfirmedPromise = joinedEventIds.length
    ? nextUpcomingClient
        .from("plans")
        .select("id, title, is_all_day, confirmed_start_at, confirmed_end_at, events(title, location_name)")
        .in("event_id", joinedEventIds)
        .eq("status", "date_confirmed")
        .gte("confirmed_start_at", nowIso)
        .order("confirmed_start_at", { ascending: true })
        .limit(1)
    : Promise.resolve({ data: [] as NextPlanRow[] });

  const nextCollectingPromise = joinedEventIds.length
    ? nextUpcomingClient
        .from("candidate_dates")
        .select("id, start_at, end_at, is_all_day, plans!inner(id, title, event_id, status, events(title, location_name))")
        .in("plans.event_id", joinedEventIds)
        .in("plans.status", ["draft", "collecting_answers"])
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(1)
    : Promise.resolve({ data: [] as NextCandidateRow[] });
```

> `candidate_dates` 側の `plans!inner(...)` に `event_id` と `status` を含めてフィルタする。列名がスキーマと合うかは `supabase/migrations/` の `candidate_dates` / `plans` 定義で確認する（`start_at` / `end_at` / `is_all_day`、`plans.event_id` / `plans.status` / `plans.confirmed_start_at` は既存コードで使用実績あり）。

- [ ] **Step 3: `Promise.all` に足して整形する**

既存の `const [{ data: calendarRows, ... }, ...] = await Promise.all([...])` に
`nextConfirmedPromise` と `nextCollectingPromise` を足し、結果を受け取る。そのあと:

```tsx
  const nextItems: HomeCalendarItem[] = [];
  const confirmedRow = ((nextConfirmedData ?? []) as NextPlanRow[])[0];
  if (confirmedRow?.confirmed_start_at) {
    const event = Array.isArray(confirmedRow.events) ? confirmedRow.events[0] : confirmedRow.events;
    nextItems.push({
      id: `confirmed-${confirmedRow.id}`,
      kind: "confirmed",
      title: event?.title?.trim() || "イベント未設定",
      location: event?.location_name?.trim() || null,
      startAt: confirmedRow.confirmed_start_at,
      endAt: confirmedRow.confirmed_end_at,
      isAllDay: confirmedRow.is_all_day,
      href: `/plans/${confirmedRow.id}`
    });
  }
  const collectingRow = ((nextCollectingData ?? []) as NextCandidateRow[])[0];
  if (collectingRow?.plans) {
    const event = Array.isArray(collectingRow.plans.events) ? collectingRow.plans.events[0] : collectingRow.plans.events;
    nextItems.push({
      id: `candidate-${collectingRow.id}`,
      kind: "collecting",
      title: event?.title?.trim() || "イベント未設定",
      location: event?.location_name?.trim() || null,
      startAt: collectingRow.start_at,
      endAt: collectingRow.end_at,
      isAllDay: collectingRow.is_all_day,
      href: `/plans/${collectingRow.plans.id}`
    });
  }
  const nextUpcomingItem = pickNextUpcoming(nextItems, new Date());
```

（`nextConfirmedData` / `nextCollectingData` は `Promise.all` の分割代入で受けた名前に合わせる）

- [ ] **Step 4: 既存の `findNextConfirmedItem` の行を消してカードを差し替える**

削除:

```tsx
  const nextConfirmedItem = findNextConfirmedItem(calendarItems, new Date());
```

JSX:

```tsx
      {nextConfirmedItem ? <HomeNextConfirmedEventCard item={nextConfirmedItem} /> : null}
```

を

```tsx
      {nextUpcomingItem ? <HomeNextUpcomingEventCard item={nextUpcomingItem} /> : null}
```

に置換。

- [ ] **Step 5: 型チェックとビルド**

Run: `npx tsc --noEmit`
Expected: エラーなし（`candidate_dates` の select 型が合わない場合は `NextCandidateRow` を実際の返り値に合わせる）

- [ ] **Step 6: 実ブラウザ確認**

`npm run dev` → ログインして `/`:
- 確定イベントがあるアカウント → 「次の予定」に確定が「確定済み」バッジで出る。
- 確定が無く調整中だけのアカウント → 直近の調整中が「調整中」バッジで出る。
- どちらも無いアカウント → カードが出ない。

- [ ] **Step 7: コミット**

```bash
git add app/page.tsx
git commit -m "feat(home): 次の予定を plans 直引きに変更（バッファ外の予定も拾う）"
```

---

## Task 4: `findNextConfirmedItem` を撤去

**Files:**
- Modify: `lib/domain/home/home-calendar.ts`
- Modify: `tests/home/home-calendar.test.ts`

**Interfaces:** なし（削除のみ）

- [ ] **Step 1: 参照が消えたことを確認**

Run: `git grep -n "findNextConfirmedItem"`
Expected: `lib/domain/home/home-calendar.ts` と `tests/home/home-calendar.test.ts` のみ（`app/page.tsx` に無い）。docs は無視。

- [ ] **Step 2: テストから削除**

`tests/home/home-calendar.test.ts`:
- import 行を `import { buildDayAriaLabel, buildHomeCalendar, type HomeCalendarItem } from "@/lib/domain/home/home-calendar";` に変更（`findNextConfirmedItem` を外す）。
- `describe("findNextConfirmedItem", () => { ... });` ブロック（88〜120 行目）を丸ごと削除。

- [ ] **Step 3: 実装から削除**

`lib/domain/home/home-calendar.ts` の `export function findNextConfirmedItem(...) { ... }`（141〜152 行目）を削除。`sortItems` は `groupItemsByDate` が使っているので残す。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run --reporter=dot tests/home/home-calendar.test.ts`
Expected: PASS（`findNextConfirmedItem` の describe が消え、残りは通る）

- [ ] **Step 5: コミット**

```bash
git add lib/domain/home/home-calendar.ts tests/home/home-calendar.test.ts
git commit -m "refactor(home): 未使用になった findNextConfirmedItem を削除"
```

---

## Task 5: イベント一覧の絞り込みをカードで囲う

**Files:**
- Modify: `components/event/event-list-controls.tsx`
- Modify: `tests/event/event-list-controls.test.tsx`

**Interfaces:** `EventListControls` の props は変えない。

比較シートの**案イ**: 状態チップは表に残し、検索欄・カテゴリ・表示順・表示件数を「検索・並び替え」の折りたたみにまとめ、全体を Madoi のカード面で囲う。ページ送り・件数表示はカードの外。

> **設計判断（コミットメッセージに残す）**: 既存テスト「検索欄は畳まず、いつでも見えるところに出す」(122 行目) は、この機能で意図的に置き換える。境界のはっきりしなさはカード面で解決し、検索は折りたたみの中に入れる。`isSearchVisible`（1ページに収まるなら検索を出さない）のロジックは維持し、出す場合は折りたたみの中に出す。

- [ ] **Step 1: テストを新設計に合わせて書き換える**

`tests/event/event-list-controls.test.tsx` の該当 `it` を修正:

- `it("状態はチップで出し、押すと1ページ目に戻る", ...)` — 変更不要（チップは表に残る）。
- `it("既定の条件なら詳しい絞り込みは畳んでおく", ...)` — 「条件を変える」を探しているなら「検索・並び替え」に文言を合わせる。畳んでいることの検証は残す。
- `it("既定以外の条件が入っていたら開いた状態で出す", ...)` — 同上、文言を「検索・並び替え」に。
- `it("検索欄は畳まず、いつでも見えるところに出す", ...)` — **書き換え**:

```tsx
  it("検索欄は『検索・並び替え』の折りたたみの中に入れる", () => {
    render(
      <EventListControls
        query={baseQuery({ search: "" })}
        draftCount={0}
        pagination={pagination({ totalItems: 40, pageSize: 10 })}
      />
    );

    // 折りたたみのサマリーは常に見える
    expect(screen.getByText("検索・並び替え")).toBeInTheDocument();
    // 検索入力自体は details の中（開けば見える）
    const details = screen.getByText("検索・並び替え").closest("details");
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByRole("searchbox")).toBeInTheDocument();
  });
```

（`within` を testing-library から import。`baseQuery` / `pagination` は既存ヘルパー名に合わせる。`searchbox` ロールは `<input type="search">` に付く）

- `it("1ページに収まる件数なら検索欄は出さない", ...)` — 検索入力が DOM に無いことの検証は維持（`isSearchVisible` は残すため）。
- `it("検索中は、結果が1件でも検索欄を出し続ける", ...)` — 検索入力が「検索・並び替え」details 内にあること、details が open で出ることに変更。
- 「絞り込み」見出しの追加を1件足す:

```tsx
  it("絞り込み全体をカード見出し付きで囲う", () => {
    render(<EventListControls query={baseQuery()} draftCount={0} pagination={pagination({ totalItems: 5 })} />);
    expect(screen.getByText("絞り込み")).toBeInTheDocument();
  });
```

- [ ] **Step 2: RED を確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: FAIL（「絞り込み」「検索・並び替え」が無い、検索欄が details 外にある）

- [ ] **Step 3: 実装を書く**

`components/event/event-list-controls.tsx` の `return ( <section ...> ... </section> )` を組み替える:

1. 一番外側 `<section className="grid grid-cols-1 gap-3">` は残す。
2. その直下に **絞り込みカード** を置く:

```tsx
<div className="rounded-card border border-line bg-surface p-4">
  <p className="text-eyebrow uppercase text-muted">絞り込み</p>
  <div className="mt-3 grid gap-3">
    {/* 状態チップの帯（既存の <nav aria-label="状態で絞り込む"> をそのまま移動） */}
    {/* 検索中の「〜で検索中／検索を解除」の行（既存をそのまま移動） */}
    {/* 「検索・並び替え」details（下記） */}
  </div>
</div>
```

3. **「検索・並び替え」details** — 既存の「条件を変える」`<details>` を作り替え、
   その `<summary>` の下に「検索フォーム」も入れる:

```tsx
<details open={!isDefaultDetail || Boolean(query.search)} className="rounded-control border border-line bg-surface">
  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-body text-muted [&::-webkit-details-marker]:hidden">
    <span className="min-w-0 flex-1 truncate">{detailSummary}</span>
    <span className="whitespace-nowrap font-bold text-pine">検索・並び替え</span>
    <span aria-hidden="true" className="text-muted">▾</span>
  </summary>
  <div className="grid gap-4 border-t border-line p-4">
    {isSearchVisible ? (
      /* 既存の検索 <form action="/events" method="get" role="search"> をここに移動 */
    ) : null}
    {/* 既存のカテゴリ/表示順/表示件数の <form> をここに移動 */}
  </div>
</details>
```

4. `detailSummary` は現行のまま（カテゴリ・表示順・件数の要約）。
5. **ページ送り・件数表示**（`pagination.totalItems > 0` の `<div>`）は絞り込みカードの**外**、`<section>` 直下の兄弟として残す。
6. 375px の縦幅に関する既存コメントは、位置が変わっても意味が通る範囲で残す。

- [ ] **Step 4: GREEN を確認**

Run: `npx vitest run --reporter=dot tests/event/event-list-controls.test.tsx`
Expected: PASS

- [ ] **Step 5: 実ブラウザ確認**

`npm run dev` → `/events`:
- 375px: 絞り込みがカードとして下のイベントカードと分離して見える。状態チップは1タップで切り替わる。「検索・並び替え」を開くと検索欄とカテゴリ/表示順/件数が出る。
- デスクトップ幅: レイアウトが崩れない。
- 検索実行 → 「検索・並び替え」が開いた状態で、検索語と「検索を解除」が見える。

- [ ] **Step 6: コミット**

```bash
git add components/event/event-list-controls.tsx tests/event/event-list-controls.test.tsx
git commit -m "feat(events): 絞り込みをカードで囲い検索/並び順を折りたたみに（案イ）

既存テスト『検索欄は畳まず』は本機能で意図的に置き換え。
境界はカード面で示し、検索は折りたたみの中に入れる。"
```

---

## Task 6: 仕上げ確認

- [ ] **Step 1: 関係するスイートをまとめて流す**

Run: `npx vitest run --reporter=dot tests/home tests/event/event-list-controls.test.tsx`
Expected: すべて PASS

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: エラーなし（新規ファイル分）

- [ ] **Step 4: 全スイート（最終確認）**

Run: `npx vitest run --reporter=dot`
Expected: すべて PASS。落ちたら原因を直す（スキップしない）。

---

## Self-Review 記録

- 設計 #1（次の予定フォールバック）→ Task 1〜4 で対応。バッファ外も拾う要件は Task 3 の plans 直引きで満たす。
- 設計 #2（フィルターの境界）→ Task 5。案イ（状態チップは表・検索/並び順は折りたたみ）＋カード面。
- 設計「実装フェーズで詰める細部」#1（admin client パターン）→ Task 3 Step 2 で踏襲。
- 型の一貫性: `pickNextUpcoming(items, now)` の名前・引数は Task 1 定義と Task 3 呼び出しで一致。`HomeNextUpcomingEventCard`／`home-next-upcoming-event-card` の名前は Task 2・3 で一致。
- PR-2（カレンダー #3/#5/#6/#7）は本計画外。別途 writing-plans。
