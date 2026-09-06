# イベント自動完了 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 開催日を過ぎたまま清算不要で開きっぱなしのイベントを、オーナーに確認プロンプト（一覧カードの帯＋ベル通知）で閉じさせ、放置されれば cron が自動で `status='done'` にする（自動 done は環境変数でガード、初期は dry-run）。

**Architecture:** 判定は純粋関数（`lib/domain/event/event-wrapup.ts`）。cron（既存の `/api/cron/notifications` に相乗り、GAS トリガー1本のまま）が純粋な sweep プランナーを呼び、通知の upsert と `events` の更新を適用する。UI は一覧カード下の帯（`app/events/page.tsx` + 新クライアントコンポーネント）と、イベント詳細ページの「完了を取り消す」ボタン。

**Tech Stack:** Next.js 15 App Router / React 19 / Supabase(@supabase/ssr) / TypeScript / Vitest + Testing Library / PostgreSQL (Supabase migrations, 手動適用) / GAS 発火の HTTP cron

## Global Constraints

- 設計: `docs/superpowers/specs/2026-09-06-event-auto-completion-design.md`（この計画の親）
- migration は手動適用。番号は `049`。CI の `db-tests` が全 migration を流す
- Vitest は `npx vitest run --reporter=dot` で流す（既定レポーターはトークン浪費）
- DB スキーマ変更は migration ファイルのみ。テストは「SQL を readFileSync して文字列を検証」（DB 接続しない）
- タイムゾーンは JST 固定。日時計算は既存の `endOfScheduleTimestamp`（`lib/domain/event/event-filter.ts`）を使う。Vercel は UTC
- `events.status` の値: `interested` / `planning` / `confirmed` / `done` / `cancelled` / `skipped`
- Server action の owner ガードは `.eq("owner_user_id", user.id)`。認証は `getCurrentActiveUser()`（`lib/supabase/server`）
- `.tsx` は `import React from "react";` を明示（規約）
- UIプリミティブは `@/components/ui` から import
- コミットは論理単位で頻繁に。各タスク末尾でコミット
- 猶予日数: プロンプトまで **30日**、プロンプト→自動 done **14日**
- 自動 done の本番有効化は環境変数 `EVENT_WRAPUP_AUTO_DONE === 'on'`。未設定/その他は dry-run（ログのみ）
- `WRAPUP_PROMPT_FLOOR_ISO` = 「このマイグレーションをマージした日 + 14日」の `YYYY-MM-DD`。この計画では `"2026-10-04"` を仮置き。実装時にマージ予定日を見て確定する

---

## ファイル構成

| ファイル | 役割 | 新規/変更 |
|---|---|---|
| `supabase/migrations/049_event_auto_completion.sql` | 2列追加・index・kind 制約・90日超バックフィル | 新規 |
| `lib/domain/event/event-filter.ts` | `getEventLastScheduleTimestamp` を export、`EventListItem` に `wrapup_snoozed_until` | 変更 |
| `lib/domain/event/event-wrapup.ts` | `isEventWrapupEligible` / `getEventWrapupTimers` / `shouldShowWrapupPrompt` / `planEventWrapupSweep` / 定数 | 新規 |
| `lib/domain/shared/site-notifications.ts` | `NotificationKind` に `wrapup_prompt` / `wrapup_done`、`notificationTitles` | 変更 |
| `lib/actions/event/events.ts` | `completeEventAction` / `snoozeEventWrapupAction` / `reopenEventAction` | 変更 |
| `app/api/cron/notifications/route.ts` | events を走査し `planEventWrapupSweep` を適用 | 変更 |
| `app/events/page.tsx` | `wrapup_snoozed_until` を取得、帯を描画 | 変更 |
| `components/event/event-wrapup-actions.tsx` | 帯の「完了にする」「後で」ボタン | 新規 |
| `app/events/[eventId]/page.tsx` | 自動 done イベントに「完了を取り消す」ボタン | 変更 |
| `components/event/event-reopen-action.tsx` | 「完了を取り消す」ボタン | 新規 |

---

## Task 1: migration 049（スキーマ）

**Files:**
- Create: `supabase/migrations/049_event_auto_completion.sql`
- Test: `tests/event/schema/event-auto-completion.test.ts`

**Interfaces:**
- Produces: `events.wrapup_snoozed_until timestamptz null`、`events.wrapup_auto_done boolean not null default false`、index `events_wrapup_scan_idx`、`notifications_kind_check` に `wrapup_prompt` / `wrapup_done`

- [ ] **Step 1: 失敗するスキーマテストを書く**

`tests/event/schema/event-auto-completion.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/049_event_auto_completion.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** SQL の -- コメントを除いた本文。コメント内の文字列で assertion をすり抜けさせない。 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("event auto-completion migration 049", () => {
  it("events に wrapup_snoozed_until / wrapup_auto_done を足す", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/add column if not exists wrapup_snoozed_until timestamptz/i);
    expect(code).toMatch(/add column if not exists wrapup_auto_done boolean not null default false/i);
  });

  it("status で絞る部分 index を作る", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(
      /create index if not exists events_wrapup_scan_idx[\s\S]*?on public\.events \(status\)[\s\S]*?where status in \('planning', 'confirmed'\)/i
    );
  });

  it("notifications_kind_check を張り直して wrapup 種別を足す（既存も残す）", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/drop constraint if exists notifications_kind_check/i);
    const checkMatch = code.match(/add constraint notifications_kind_check check \(([\s\S]*?)\)\s*;/i);
    expect(checkMatch, "kind check が見つからない").not.toBeNull();
    const list = checkMatch![1];
    for (const kind of [
      "answer_deadline",
      "unanswered",
      "answer_received",
      "settlement_needed",
      "payment_due",
      "confirmation_due",
      "event_invitation",
      "event_message",
      "wrapup_prompt",
      "wrapup_done"
    ]) {
      expect(list, `${kind} が kind check に無い`).toContain(`'${kind}'`);
    }
  });

  it("最終開催日が90日超前の planning/confirmed を恒久スヌーズするバックフィルがある", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/update public\.events/i);
    expect(code).toMatch(/wrapup_snoozed_until = '2999-01-01/i);
    expect(code).toMatch(/now\(\) - interval '90 days'/i);
    expect(code).toMatch(/wrapup_snoozed_until is null/i);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/event/schema/event-auto-completion.test.ts --reporter=dot`
Expected: FAIL（ファイルが無い → `ENOENT`）

- [ ] **Step 3: migration を書く**

`supabase/migrations/049_event_auto_completion.sql`:

```sql
-- イベントの自動完了。
--
-- 開催日を過ぎて清算不要のイベントは events.status が planning/confirmed のまま
-- 放置される（done を立てる経路が現状ゼロ）。最終開催日+30日で確認プロンプトを出し、
-- さらに14日オーナーの操作が無ければ cron が status='done' にする。
-- 設計: docs/superpowers/specs/2026-09-06-event-auto-completion-design.md
--
-- タイマー（promptDue / autoDoneDue）は列に保存しない。cron が毎回 plans と
-- 日付から導出する。保存するのは「後で」「戻す」が書く wrapup_snoozed_until と、
-- cron が自動 done したことを示す wrapup_auto_done だけ。

alter table public.events
  add column if not exists wrapup_snoozed_until timestamptz,
  add column if not exists wrapup_auto_done boolean not null default false;

-- cron はこの2状態のイベントだけ走査する。
create index if not exists events_wrapup_scan_idx
  on public.events (status)
  where status in ('planning', 'confirmed');

-- 通知種別に wrapup を追加（既存はすべて残す。migration 017 と同じパターン）。
alter table public.notifications
drop constraint if exists notifications_kind_check;

alter table public.notifications
add constraint notifications_kind_check check (
  kind in (
    'answer_deadline',
    'unanswered',
    'answer_received',
    'settlement_needed',
    'payment_due',
    'confirmation_due',
    'event_invitation',
    'event_message',
    'wrapup_prompt',
    'wrapup_done'
  )
);

-- バックフィル: このマイグレーション適用時点で最終開催日が90日超前の
-- planning/confirmed イベントは「もう気にしていない」扱い。恒久スヌーズして
-- wrapup の対象から外す（プロンプトも自動 done も出ない）。
-- 最終開催日は「取り消し以外の確定プランの最遅終了」または events の開催日。
update public.events e
set wrapup_snoozed_until = '2999-01-01T00:00:00Z'
where e.status in ('planning', 'confirmed')
  and e.wrapup_snoozed_until is null
  and coalesce(
    (
      select max(coalesce(p.confirmed_end_at, p.confirmed_start_at))
      from public.plans p
      where p.event_id = e.id
        and p.status not in ('cancelled', 'skipped')
        and p.confirmed_start_at is not null
    ),
    (coalesce(e.end_date, e.start_date) + 1)::timestamp at time zone 'Asia/Tokyo'
  ) < now() - interval '90 days';

-- ロールバック:
--   alter table public.events drop column if exists wrapup_snoozed_until;
--   alter table public.events drop column if exists wrapup_auto_done;
--   drop index if exists public.events_wrapup_scan_idx;
--   （notifications_kind_check は migration 017 の内容へ張り直す）
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/event/schema/event-auto-completion.test.ts --reporter=dot`
Expected: PASS (4)

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/049_event_auto_completion.sql tests/event/schema/event-auto-completion.test.ts
git commit -m "migration 049: イベント自動完了の列・index・通知種別"
```

---

## Task 2: 対象判定とタイマー（純粋関数）

**Files:**
- Modify: `lib/domain/event/event-filter.ts`（`getEventLastScheduleTimestamp` を export、`EventListItem` に列追加）
- Create: `lib/domain/event/event-wrapup.ts`
- Test: `tests/event/event-wrapup.test.ts`

**Interfaces:**
- Consumes: `getEventDisplayState`, `EventListItem`（`event-filter.ts`）
- Produces:
  - `getEventLastScheduleTimestamp(event: EventListItem): number | null`（`event-filter.ts` から export）
  - `type EventWrapupInput = EventListItem & { wrapup_snoozed_until?: string | null }`
  - `WRAPUP_PROMPT_DELAY_MS`, `WRAPUP_AUTO_DONE_DELAY_MS`, `WRAPUP_PROMPT_FLOOR_ISO`
  - `isEventWrapupEligible(event: EventWrapupInput, now?: Date): boolean`
  - `getEventWrapupTimers(event: EventWrapupInput, options?: { promptFloorIso?: string }): { promptDue: number; autoDoneDue: number } | null`
  - `shouldShowWrapupPrompt(event: EventWrapupInput, now?: Date): boolean`

- [ ] **Step 1: `event-filter.ts` に `getEventLastScheduleTimestamp` を追加**

`lib/domain/event/event-filter.ts`、`isEventLifecycleFinished` の直後（`export function getEventDisplayState` の直前あたり）に追加:

```ts
/**
 * 「最終開催日」の絶対時刻(ms)。isEventLifecycleFinished が過去判定に使う値と同じ。
 * - 取り消し以外の関連プランがあり、全部に終了時刻があれば、その最遅
 * - 関連プランが無ければ event.end_date ?? start_date の当日終わり(JST)
 * - 終了時刻の無い関連プランが1つでもあれば「まだ確定しきっていない」とみなし null
 */
export function getEventLastScheduleTimestamp(event: EventListItem): number | null {
  const relevantPlans = (event.plans ?? []).filter((plan) => !ignoredPlanStatuses.has(plan.status ?? ""));

  if (relevantPlans.length > 0) {
    const ends: number[] = [];
    for (const plan of relevantPlans) {
      const endAt = plan.confirmed_end_at ?? plan.confirmed_start_at;
      if (!endAt) {
        return null;
      }
      ends.push(endOfScheduleTimestamp(endAt, plan.is_all_day === true));
    }
    return Math.max(...ends);
  }

  const endAt = event.end_date ?? event.start_date;
  if (!endAt) {
    return null;
  }
  return endOfScheduleTimestamp(endAt, true);
}
```

- [ ] **Step 2: `EventListItem` に `wrapup_snoozed_until` を追加**

`lib/domain/event/event-filter.ts` の `EventListItem` 型（現状 `status` / `created_at` / `start_date` / `end_date` / `plans` / `event_members`）に1行足す:

```ts
export type EventListItem = {
  status: string;
  created_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  wrapup_snoozed_until?: string | null;
  plans?: readonly EventListPlan[] | null;
  event_members?: readonly { status?: string | null }[] | null;
};
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/event/event-wrapup.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getEventWrapupTimers,
  isEventWrapupEligible,
  shouldShowWrapupPrompt,
  WRAPUP_AUTO_DONE_DELAY_MS,
  WRAPUP_PROMPT_DELAY_MS,
  type EventWrapupInput
} from "@/lib/domain/event/event-wrapup";

const NOW = new Date("2026-06-01T00:00:00+09:00");
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

function pastConfirmedEvent(overrides: Partial<EventWrapupInput> = {}): EventWrapupInput {
  return {
    status: "confirmed",
    start_date: null,
    end_date: null,
    plans: [
      {
        status: "date_confirmed",
        settlement_status: "not_needed",
        confirmed_start_at: iso(-40),
        confirmed_end_at: iso(-40),
        is_all_day: false
      }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

describe("isEventWrapupEligible", () => {
  it("期日超過・清算不要・confirmed は対象", () => {
    expect(isEventWrapupEligible(pastConfirmedEvent(), NOW)).toBe(true);
  });

  it("planning でも期日超過・プランなし・開催日が過去なら対象", () => {
    const event: EventWrapupInput = {
      status: "planning",
      start_date: iso(-40).slice(0, 10),
      end_date: null,
      plans: [],
      event_members: [{ status: "joined" }]
    };
    expect(isEventWrapupEligible(event, NOW)).toBe(true);
  });

  it("done / cancelled / skipped は対象外", () => {
    for (const status of ["done", "cancelled", "skipped"]) {
      expect(isEventWrapupEligible(pastConfirmedEvent({ status }), NOW)).toBe(false);
    }
  });

  it("未来の確定予定があれば対象外", () => {
    const event = pastConfirmedEvent({
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: iso(10),
          confirmed_end_at: iso(10),
          is_all_day: false
        }
      ]
    });
    expect(isEventWrapupEligible(event, NOW)).toBe(false);
  });

  it("清算待ちは対象外", () => {
    const event = pastConfirmedEvent({
      plans: [
        {
          status: "date_confirmed",
          settlement_status: "needed",
          confirmed_start_at: iso(-40),
          confirmed_end_at: iso(-40),
          is_all_day: false
        }
      ]
    });
    expect(isEventWrapupEligible(event, NOW)).toBe(false);
  });
});

describe("getEventWrapupTimers", () => {
  it("最終開催日 + 30日 が promptDue、その 14日後が autoDoneDue", () => {
    const timers = getEventWrapupTimers(pastConfirmedEvent(), { promptFloorIso: "2020-01-01" });
    const lastMs = new Date(iso(-40)).getTime();
    expect(timers).not.toBeNull();
    expect(timers!.promptDue).toBe(lastMs + WRAPUP_PROMPT_DELAY_MS);
    expect(timers!.autoDoneDue).toBe(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS);
  });

  it("wrapup_snoozed_until が後ろにあればそちらが promptDue", () => {
    const snooze = iso(100);
    const timers = getEventWrapupTimers(
      pastConfirmedEvent({ wrapup_snoozed_until: snooze }),
      { promptFloorIso: "2020-01-01" }
    );
    expect(timers!.promptDue).toBe(new Date(snooze).getTime());
  });

  it("promptFloor が後ろにあればそちらが promptDue", () => {
    const timers = getEventWrapupTimers(pastConfirmedEvent(), { promptFloorIso: "2999-01-01" });
    expect(timers!.promptDue).toBe(new Date("2999-01-01T00:00:00+09:00").getTime());
  });

  it("最終開催日が決まらなければ null", () => {
    const event: EventWrapupInput = {
      status: "planning",
      start_date: null,
      end_date: null,
      plans: [],
      event_members: []
    };
    expect(getEventWrapupTimers(event)).toBeNull();
  });
});

describe("shouldShowWrapupPrompt", () => {
  it("promptDue を過ぎていれば true", () => {
    const later = new Date(new Date(iso(-40)).getTime() + WRAPUP_PROMPT_DELAY_MS + 1000);
    expect(shouldShowWrapupPrompt(pastConfirmedEvent(), later)).toBe(true);
  });

  it("promptDue 前なら false", () => {
    expect(shouldShowWrapupPrompt(pastConfirmedEvent(), NOW)).toBe(false);
  });

  it("恒久スヌーズ(2999)なら false", () => {
    const later = new Date("2030-01-01T00:00:00+09:00");
    expect(
      shouldShowWrapupPrompt(pastConfirmedEvent({ wrapup_snoozed_until: "2999-01-01T00:00:00Z" }), later)
    ).toBe(false);
  });
});
```

- [ ] **Step 4: テストが落ちることを確認**

Run: `npx vitest run tests/event/event-wrapup.test.ts --reporter=dot`
Expected: FAIL（`event-wrapup` が無い）

- [ ] **Step 5: `event-wrapup.ts` を実装**

`lib/domain/event/event-wrapup.ts`:

```ts
import { getEventDisplayState, getEventLastScheduleTimestamp, type EventListItem } from "@/lib/domain/event/event-filter";

const DAY_MS = 24 * 60 * 60 * 1000;

export const WRAPUP_PROMPT_DELAY_MS = 30 * DAY_MS;
export const WRAPUP_AUTO_DONE_DELAY_MS = 14 * DAY_MS;

/**
 * どのイベントも、この日付より前にはプロンプト・自動 done を出さない。
 * 「migration 049 をマージした日 + 14日」を入れる。バックフィル対象が
 * リリース直後に一斉発火するのを防ぐ保険。2週間経てば実質無効。
 */
export const WRAPUP_PROMPT_FLOOR_ISO = "2026-10-04";

export type EventWrapupInput = EventListItem & { wrapup_snoozed_until?: string | null };

export function isEventWrapupEligible(event: EventWrapupInput, now = new Date()): boolean {
  if (event.status !== "planning" && event.status !== "confirmed") {
    return false;
  }
  // completed = lifecycle 済み かつ 清算片付き済み。清算待ちなら settlement_waiting になる。
  return getEventDisplayState(event, now) === "completed";
}

export function getEventWrapupTimers(
  event: EventWrapupInput,
  options: { promptFloorIso?: string } = {}
): { promptDue: number; autoDoneDue: number } | null {
  const lastMs = getEventLastScheduleTimestamp(event);
  if (lastMs === null) {
    return null;
  }

  const snoozeMs = event.wrapup_snoozed_until ? Date.parse(event.wrapup_snoozed_until) : 0;
  const floorMs = Date.parse(`${options.promptFloorIso ?? WRAPUP_PROMPT_FLOOR_ISO}T00:00:00+09:00`);

  const promptDue = Math.max(lastMs + WRAPUP_PROMPT_DELAY_MS, snoozeMs, floorMs);
  return { promptDue, autoDoneDue: promptDue + WRAPUP_AUTO_DONE_DELAY_MS };
}

export function shouldShowWrapupPrompt(event: EventWrapupInput, now = new Date()): boolean {
  if (!isEventWrapupEligible(event, now)) {
    return false;
  }
  const timers = getEventWrapupTimers(event);
  return timers !== null && now.getTime() >= timers.promptDue;
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/event/event-wrapup.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 7: 既存の event-filter テストが壊れていないか確認**

Run: `npx vitest run tests/event/event-filter.test.ts --reporter=dot`
Expected: PASS（型に1列足しただけ、既存挙動は不変）

- [ ] **Step 8: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 9: コミット**

```bash
git add lib/domain/event/event-filter.ts lib/domain/event/event-wrapup.ts tests/event/event-wrapup.test.ts
git commit -m "feat(event): wrapup の対象判定とタイマー計算（純粋関数）"
```

---

## Task 3: sweep プランナーと通知種別

**Files:**
- Modify: `lib/domain/shared/site-notifications.ts`（`NotificationKind` に2種、`notificationTitles`）
- Modify: `lib/domain/event/event-wrapup.ts`（`planEventWrapupSweep` 追加）
- Test: `tests/event/event-wrapup-sweep.test.ts`

**Interfaces:**
- Consumes: `isEventWrapupEligible`, `getEventWrapupTimers`（Task 2）
- Produces:
  - `NotificationKind` に `"wrapup_prompt"` / `"wrapup_done"`
  - `type EventWrapupSweepEvent = EventWrapupInput & { id: string; title: string; owner_user_id: string }`
  - `type EventWrapupNotificationRow = { user_id: string; kind: "wrapup_prompt" | "wrapup_done"; title: string; body: string; href: string; dedupe_key: string }`
  - `planEventWrapupSweep(events: readonly EventWrapupSweepEvent[], now: Date, options: { autoDoneEnabled: boolean }): { notifications: EventWrapupNotificationRow[]; autoComplete: string[]; wouldAutoComplete: string[] }`

- [ ] **Step 1: `NotificationKind` に2種足す**

`lib/domain/shared/site-notifications.ts` の `NotificationKind` union に追加:

```ts
export type NotificationKind =
  | "answer_deadline"
  | "unanswered"
  | "answer_received"
  | "settlement_needed"
  | "payment_due"
  | "confirmation_due"
  | "event_message"
  | "wrapup_prompt"
  | "wrapup_done";
```

同ファイルの `notificationTitles`（`event_message: "イベントに新しいメッセージがあります"` がある Record）に2行追加:

```ts
  wrapup_prompt: "終わったイベントの確認",
  wrapup_done: "イベントを完了にしました"
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/event/event-wrapup-sweep.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  planEventWrapupSweep,
  WRAPUP_AUTO_DONE_DELAY_MS,
  WRAPUP_PROMPT_DELAY_MS,
  type EventWrapupSweepEvent
} from "@/lib/domain/event/event-wrapup";

const FLOOR = "2020-01-01";
const baseMs = new Date("2026-06-01T00:00:00+09:00").getTime();
const at = (offsetDays: number) => new Date(baseMs + offsetDays * 24 * 60 * 60 * 1000).toISOString();

function event(id: string, confirmedDayOffset: number, overrides: Partial<EventWrapupSweepEvent> = {}): EventWrapupSweepEvent {
  return {
    id,
    title: `イベント${id}`,
    owner_user_id: `owner-${id}`,
    status: "confirmed",
    start_date: null,
    end_date: null,
    plans: [
      {
        status: "date_confirmed",
        settlement_status: "not_needed",
        confirmed_start_at: at(confirmedDayOffset),
        confirmed_end_at: at(confirmedDayOffset),
        is_all_day: false
      }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

// FLOOR を差し替えるため promptFloorIso を使う planEventWrapupSweep のシグネチャ:
// 実装では options に promptFloorIso を通せるようにする（テスト用）。

describe("planEventWrapupSweep", () => {
  it("promptDue を過ぎ autoDoneDue 前なら wrapup_prompt 通知を1件出す", () => {
    const lastMs = new Date(at(-40)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("a", -40)], now, {
      autoDoneEnabled: false,
      promptFloorIso: FLOOR
    });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      user_id: "owner-a",
      kind: "wrapup_prompt",
      href: "/events/a"
    });
    expect(result.notifications[0].dedupe_key).toMatch(/^event_wrapup:a:\d{4}-\d{2}-\d{2}$/);
    expect(result.autoComplete).toEqual([]);
    expect(result.wouldAutoComplete).toEqual([]);
  });

  it("autoDoneDue を過ぎ autoDoneEnabled=true なら autoComplete と wrapup_done 通知", () => {
    const lastMs = new Date(at(-60)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("b", -60)], now, {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result.autoComplete).toEqual(["b"]);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({ kind: "wrapup_done", href: "/events/b" });
    expect(result.notifications[0].dedupe_key).toBe("event_wrapup_done:b");
  });

  it("autoDoneDue を過ぎても autoDoneEnabled=false なら wouldAutoComplete のみ、通知なし", () => {
    const lastMs = new Date(at(-60)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + WRAPUP_AUTO_DONE_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("c", -60)], now, {
      autoDoneEnabled: false,
      promptFloorIso: FLOOR
    });
    expect(result.wouldAutoComplete).toEqual(["c"]);
    expect(result.autoComplete).toEqual([]);
    expect(result.notifications).toEqual([]);
  });

  it("本番の wrapup_prompt 本文には自動完了の期限が入る", () => {
    const lastMs = new Date(at(-40)).getTime();
    const now = new Date(lastMs + WRAPUP_PROMPT_DELAY_MS + 1000);
    const result = planEventWrapupSweep([event("d", -40)], now, {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result.notifications[0].body).toMatch(/自動で完了/);
  });

  it("対象外イベントは何も出さない", () => {
    const result = planEventWrapupSweep([event("e", -40, { status: "done" })], new Date(), {
      autoDoneEnabled: true,
      promptFloorIso: FLOOR
    });
    expect(result).toEqual({ notifications: [], autoComplete: [], wouldAutoComplete: [] });
  });
});
```

- [ ] **Step 3: テストが落ちることを確認**

Run: `npx vitest run tests/event/event-wrapup-sweep.test.ts --reporter=dot`
Expected: FAIL（`planEventWrapupSweep` が無い）

- [ ] **Step 4: `planEventWrapupSweep` を実装**

`lib/domain/event/event-wrapup.ts` に追加（`options` に `promptFloorIso` を通せるよう `getEventWrapupTimers` 呼び出しへ引き渡す）:

```ts
import { formatDate } from "@/lib/shared/format";

export type EventWrapupSweepEvent = EventWrapupInput & {
  id: string;
  title: string;
  owner_user_id: string;
};

export type EventWrapupNotificationRow = {
  user_id: string;
  kind: "wrapup_prompt" | "wrapup_done";
  title: string;
  body: string;
  href: string;
  dedupe_key: string;
};

function promptDedupeKey(eventId: string, promptDue: number): string {
  return `event_wrapup:${eventId}:${new Date(promptDue).toISOString().slice(0, 10)}`;
}

export function planEventWrapupSweep(
  events: readonly EventWrapupSweepEvent[],
  now: Date,
  options: { autoDoneEnabled: boolean; promptFloorIso?: string }
): {
  notifications: EventWrapupNotificationRow[];
  autoComplete: string[];
  wouldAutoComplete: string[];
} {
  const notifications: EventWrapupNotificationRow[] = [];
  const autoComplete: string[] = [];
  const wouldAutoComplete: string[] = [];
  const nowMs = now.getTime();

  for (const event of events) {
    if (!isEventWrapupEligible(event, now)) {
      continue;
    }
    const timers = getEventWrapupTimers(event, { promptFloorIso: options.promptFloorIso });
    if (!timers) {
      continue;
    }

    if (nowMs >= timers.autoDoneDue) {
      if (options.autoDoneEnabled) {
        autoComplete.push(event.id);
        notifications.push({
          user_id: event.owner_user_id,
          kind: "wrapup_done",
          title: "イベントを完了にしました",
          body: `「${event.title}」を完了にしました。1ヶ月以上動きがなかったためです。`,
          href: `/events/${event.id}`,
          dedupe_key: `event_wrapup_done:${event.id}`
        });
      } else {
        wouldAutoComplete.push(event.id);
      }
      continue;
    }

    if (nowMs >= timers.promptDue) {
      const deadline = formatDate(new Date(timers.autoDoneDue).toISOString());
      notifications.push({
        user_id: event.owner_user_id,
        kind: "wrapup_prompt",
        title: "終わったイベントの確認",
        body: options.autoDoneEnabled
          ? `「${event.title}」は終わりましたか？ このまま何もしないと${deadline}に自動で完了になります。`
          : `「${event.title}」は終わりましたか？`,
        href: `/events/${event.id}`,
        dedupe_key: promptDedupeKey(event.id, timers.promptDue)
      });
    }
  }

  return { notifications, autoComplete, wouldAutoComplete };
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run tests/event/event-wrapup-sweep.test.ts tests/event/event-wrapup.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 6: 通知関連の既存テストが壊れていないか確認**

Run: `npx vitest run tests/shared/site-notifications.test.ts tests/notification --reporter=dot`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add lib/domain/shared/site-notifications.ts lib/domain/event/event-wrapup.ts tests/event/event-wrapup-sweep.test.ts
git commit -m "feat(event): wrapup sweep プランナーと通知種別 wrapup_prompt/wrapup_done"
```

---

## Task 4: Server Actions

**Files:**
- Modify: `lib/actions/event/events.ts`
- Test: `tests/event/actions/event-wrapup-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentActiveUser`, `createSupabaseServerClient`（`@/lib/supabase/server`）、`revalidatePath`
- Produces:
  - `completeEventAction(eventId: string): Promise<void>`
  - `snoozeEventWrapupAction(eventId: string): Promise<void>`
  - `reopenEventAction(eventId: string): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/actions/event-wrapup-actions.test.ts`（`tests/event/actions/duplicate-event.test.ts` のモック方式に倣う）:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentActiveUser, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentActiveUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentActiveUser }));

import {
  completeEventAction,
  reopenEventAction,
  snoozeEventWrapupAction
} from "@/lib/actions/event/events";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";

type Update = { table: string; values: Record<string, unknown>; filters: Record<string, unknown> };

function client() {
  const updates: Update[] = [];
  const from = vi.fn((table: string) => {
    const record: Update = { table, values: {}, filters: {} };
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((values: Record<string, unknown>) => {
      record.values = values;
      updates.push(record);
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      record.filters[column] = value;
      return builder;
    });
    builder.is = vi.fn((column: string, value: unknown) => {
      record.filters[`${column}:is`] = value;
      return builder;
    });
    builder.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });
  return { client: { from }, updates };
}

describe("event wrapup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentActiveUser.mockResolvedValue({ id: userId });
  });

  it("completeEventAction は status=done, wrapup_auto_done=false に更新し owner で絞る", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await completeEventAction(eventId);

    const eventUpdate = updates.find((u) => u.table === "events");
    expect(eventUpdate?.values).toEqual({ status: "done", wrapup_auto_done: false });
    expect(eventUpdate?.filters).toMatchObject({ id: eventId, owner_user_id: userId });
    expect(revalidatePath).toHaveBeenCalledWith("/events");
  });

  it("snoozeEventWrapupAction は wrapup_snoozed_until を約30日先にする", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    const before = Date.now();
    await snoozeEventWrapupAction(eventId);
    const eventUpdate = updates.find((u) => u.table === "events");
    const snoozedUntil = new Date(String(eventUpdate?.values.wrapup_snoozed_until)).getTime();
    expect(snoozedUntil).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
    expect(snoozedUntil).toBeLessThan(before + 31 * 24 * 60 * 60 * 1000);
    expect(eventUpdate?.filters).toMatchObject({ id: eventId, owner_user_id: userId });
  });

  it("reopenEventAction は status=planning に戻し wrapup_auto_done=false, snooze を30日先に", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await reopenEventAction(eventId);

    const eventUpdate = updates.find((u) => u.table === "events");
    expect(eventUpdate?.values.status).toBe("planning");
    expect(eventUpdate?.values.wrapup_auto_done).toBe(false);
    expect(eventUpdate?.values.wrapup_snoozed_until).toBeTruthy();
  });

  it("未読の wrapup_prompt 通知を既読化する", async () => {
    const { client: c, updates } = client();
    createSupabaseServerClient.mockResolvedValue(c);

    await completeEventAction(eventId);

    const notifUpdate = updates.find((u) => u.table === "notifications");
    expect(notifUpdate?.values).toHaveProperty("read_at");
    expect(notifUpdate?.filters).toMatchObject({ user_id: userId, kind: "wrapup_prompt" });
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/event/actions/event-wrapup-actions.test.ts --reporter=dot`
Expected: FAIL（アクションが無い）

- [ ] **Step 3: アクションを実装**

`lib/actions/event/events.ts` の末尾に追加:

```ts
async function markWrapupPromptRead(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string,
  userId: string
) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", "wrapup_prompt")
    .eq("href", `/events/${eventId}`)
    .is("read_at", null);
}

/** 帯・通知の「完了にする」。期日超過イベントを手動で締める。 */
export async function completeEventAction(eventId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("events")
    .update({ status: "done", wrapup_auto_done: false })
    .eq("id", eventId)
    .eq("owner_user_id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  await markWrapupPromptRead(supabase, eventId, user.id);

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}

/** 帯・通知の「後で」。確認プロンプトを30日先送りする。 */
export async function snoozeEventWrapupAction(eventId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const snoozedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("events")
    .update({ wrapup_snoozed_until: snoozedUntil })
    .eq("id", eventId)
    .eq("owner_user_id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  await markWrapupPromptRead(supabase, eventId, user.id);

  revalidatePath("/");
  revalidatePath("/events");
}

/** 自動完了の取り消し。done を planning に戻す（done のままだと lifecycle 判定が永久に短絡する）。 */
export async function reopenEventAction(eventId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const snoozedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("events")
    .update({ status: "planning", wrapup_auto_done: false, wrapup_snoozed_until: snoozedUntil })
    .eq("id", eventId)
    .eq("owner_user_id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}
```

> 注: `markWrapupPromptRead` は `href` で該当イベントの通知を絞る（`dedupe_key` はスヌーズ期間で変わるため、`href` の方が安定）。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/event/actions/event-wrapup-actions.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add lib/actions/event/events.ts tests/event/actions/event-wrapup-actions.test.ts
git commit -m "feat(event): completeEvent/snoozeEventWrapup/reopenEvent アクション"
```

---

## Task 5: cron に events sweep を組み込む

**Files:**
- Modify: `app/api/cron/notifications/route.ts`
- Test: `tests/notification/cron-event-wrapup.test.ts`

**Interfaces:**
- Consumes: `planEventWrapupSweep`, `EventWrapupSweepEvent`（Task 3）
- Produces: レスポンス JSON に `wrapup: { notified, autoCompleted, wouldAutoComplete, eventsScanned }` を追加

- [ ] **Step 1: 失敗するテストを書く**

`tests/notification/cron-event-wrapup.test.ts`（`tests/notification/cron-notifications-pagination.test.ts` のモック方式に倣う）:

```ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  hasSupabaseAdminEnv: () => true
}));

import { GET } from "@/app/api/cron/notifications/route";

function request() {
  return new NextRequest("http://localhost/api/cron/notifications", {
    headers: { authorization: "Bearer test-secret" }
  });
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * plans ページング（既存 cron 用、空を返す）と events 走査、notifications upsert、
 * events update を記録するモック。
 */
function client(events: Array<Record<string, unknown>>) {
  const upserts: unknown[][] = [];
  const eventUpdates: Array<{ values: Record<string, unknown>; id: unknown }> = [];

  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      return {
        upsert: vi.fn(async (rows: unknown[]) => {
          upserts.push(rows);
          return { error: null };
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(async () => ({ error: null })) })) })) }))
      };
    }

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.gt = chain;
    if (table === "events") {
      builder.update = vi.fn((values: Record<string, unknown>) => ({
        eq: vi.fn((_c: string, id: unknown) => {
          eventUpdates.push({ values, id });
          return { eq: vi.fn(async () => ({ error: null })) };
        })
      }));
      builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: events, error: null }).then(resolve);
    } else {
      // plans: 空
      builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
    }
    return builder;
  });

  return { client: { from }, upserts, eventUpdates };
}

function pastEvent(id: string, dayOffset: number, overrides: Record<string, unknown> = {}) {
  const at = new Date(Date.now() + dayOffset * DAY).toISOString();
  return {
    id,
    title: `イベント${id}`,
    owner_user_id: `owner-${id}`,
    status: "confirmed",
    start_date: null,
    end_date: null,
    wrapup_snoozed_until: null,
    plans: [
      { status: "date_confirmed", settlement_status: "not_needed", confirmed_start_at: at, confirmed_end_at: at, is_all_day: false }
    ],
    event_members: [{ status: "joined" }],
    ...overrides
  };
}

describe("GET /api/cron/notifications — event wrapup", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.stubEnv("EVENT_WRAPUP_AUTO_DONE", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("promptDue 超えのイベントに wrapup_prompt を upsert する", async () => {
    const { client: c, upserts } = client([pastEvent("a", -45)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    const allRows = upserts.flat() as Array<{ kind: string }>;
    expect(allRows.some((r) => r.kind === "wrapup_prompt")).toBe(true);
    expect(body.wrapup.notified).toBe(1);
  });

  it("autoDoneDue 超え・EVENT_WRAPUP_AUTO_DONE 未設定なら status を変えず wouldAutoComplete に載せる", async () => {
    const { client: c, eventUpdates } = client([pastEvent("b", -70)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(eventUpdates).toEqual([]);
    expect(body.wrapup.wouldAutoComplete).toBe(1);
    expect(body.wrapup.autoCompleted).toBe(0);
  });

  it("autoDoneDue 超え・EVENT_WRAPUP_AUTO_DONE=on なら status=done に更新し wrapup_done を出す", async () => {
    vi.stubEnv("EVENT_WRAPUP_AUTO_DONE", "on");
    const { client: c, eventUpdates, upserts } = client([pastEvent("c", -70)]);
    createSupabaseAdminClient.mockReturnValue(c);

    const res = await GET(request());
    const body = await res.json();

    expect(eventUpdates).toHaveLength(1);
    expect(eventUpdates[0].values).toMatchObject({ status: "done", wrapup_auto_done: true });
    const allRows = upserts.flat() as Array<{ kind: string }>;
    expect(allRows.some((r) => r.kind === "wrapup_done")).toBe(true);
    expect(body.wrapup.autoCompleted).toBe(1);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/notification/cron-event-wrapup.test.ts --reporter=dot`
Expected: FAIL（`body.wrapup` が undefined）

- [ ] **Step 3: cron に sweep を組み込む**

`app/api/cron/notifications/route.ts`。既存の `buildNotificationCandidate` による upsert の後、`return NextResponse.json(...)` の前に events sweep を追加する。

ファイル冒頭の import に追加:

```ts
import {
  planEventWrapupSweep,
  type EventWrapupSweepEvent
} from "@/lib/domain/event/event-wrapup";
```

> floor はモジュール定数ではなく `GET()` 内で `process.env.EVENT_WRAPUP_PROMPT_FLOOR ?? "2026-10-04"` として読む（テストが `vi.stubEnv` で差し替えられるように）。`cron-event-wrapup.test.ts` の `beforeEach` で `vi.stubEnv("EVENT_WRAPUP_PROMPT_FLOOR", "2000-01-01")` を追加すること。

`GET` 関数内、既存の plan 通知処理（`candidates` の upsert）の後に:

```ts
  // --- イベントの自動完了（wrapup） ---
  const wrapupEvents: EventWrapupSweepEvent[] = [];
  {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let query = supabase
        .from("events")
        .select(
          "id, title, owner_user_id, status, start_date, end_date, wrapup_snoozed_until, plans(status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
        )
        .in("status", ["planning", "confirmed"])
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor) {
        query = query.gt("id", cursor);
      }
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as EventWrapupSweepEvent[];
      wrapupEvents.push(...rows);
      if (rows.length < PAGE_SIZE) {
        break;
      }
      cursor = rows[rows.length - 1].id;
    }
  }

  const autoDoneEnabled = process.env.EVENT_WRAPUP_AUTO_DONE === "on";
  const sweep = planEventWrapupSweep(wrapupEvents, now, {
    autoDoneEnabled,
    promptFloorIso: process.env.EVENT_WRAPUP_PROMPT_FLOOR ?? "2026-10-04"
  });

  const wrapupErrors: string[] = [];

  if (sweep.notifications.length > 0) {
    const { error } = await supabase.from("notifications").upsert(sweep.notifications, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true
    });
    if (error) {
      wrapupErrors.push(`notifications: ${error.message}`);
    }
  }

  for (const eventId of sweep.autoComplete) {
    const { error } = await supabase
      .from("events")
      .update({ status: "done", wrapup_auto_done: true })
      .eq("id", eventId)
      .eq("status", "confirmed" as never); // planning/confirmed どちらでも当たるよう下記に修正
    if (error) {
      wrapupErrors.push(`event ${eventId}: ${error.message}`);
    }
  }

  for (const eventId of sweep.wouldAutoComplete) {
    console.log("[wrapup] would auto-complete", { eventId });
  }
```

> 修正: `sweep.autoComplete` の更新は `.eq("id", eventId)` のみで絞る（status 二重指定はしない）。上の擬似コードの `.eq("status", ...)` 行は削除して:
> ```ts
>     const { error } = await supabase
>       .from("events")
>       .update({ status: "done", wrapup_auto_done: true })
>       .eq("id", eventId);
> ```

最後に既存の `return NextResponse.json({ created: candidates.length, plansScanned: plans.length });` を次に置き換える:

```ts
  return NextResponse.json({
    created: candidates.length,
    plansScanned: plans.length,
    wrapup: {
      notified: sweep.notifications.filter((n) => n.kind === "wrapup_prompt").length,
      autoCompleted: sweep.autoComplete.length,
      wouldAutoComplete: sweep.wouldAutoComplete.length,
      eventsScanned: wrapupEvents.length,
      errors: wrapupErrors
    }
  });
```

> 注: 既存コードは `candidates.length === 0` のとき早期 return する。その分岐でも wrapup を回すため、早期 return を消して常に sweep まで到達させる。`candidates` が空なら plan 通知の upsert をスキップするだけにする。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/notification/cron-event-wrapup.test.ts tests/notification/cron-notifications-route.test.ts tests/notification/cron-notifications-pagination.test.ts --reporter=dot`
Expected: PASS（既存の cron テストも壊れないこと）

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add app/api/cron/notifications/route.ts tests/notification/cron-event-wrapup.test.ts
git commit -m "feat(cron): events を走査して wrapup 通知・自動完了を適用（環境変数ガード）"
```

---

## Task 6: 一覧カードの確認帯

**Files:**
- Create: `components/event/event-wrapup-actions.tsx`
- Modify: `app/events/page.tsx`
- Test: `tests/event/events-page.test.tsx`（既存に追記）

**Interfaces:**
- Consumes: `shouldShowWrapupPrompt`（Task 2）、`completeEventAction` / `snoozeEventWrapupAction`（Task 4）
- Produces: `EventWrapupActions`（`{ completeAction: () => void | Promise<void>; snoozeAction: () => void | Promise<void> }`）

- [ ] **Step 1: クライアントコンポーネントを作る**

`components/event/event-wrapup-actions.tsx`:

```tsx
"use client";

import React from "react";

export function EventWrapupActions({
  completeAction,
  snoozeAction
}: {
  completeAction: (formData: FormData) => void | Promise<void>;
  snoozeAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="mt-4 rounded-control border-t border-dashed border-line-strong bg-sunken px-4 pt-3 pb-3.5">
      <p className="text-sm font-bold text-ink">
        開催おつかれさまでした。<span className="font-normal text-muted">このイベント、締めていい？</span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <form action={completeAction}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            完了にする
          </button>
        </form>
        <form action={snoozeAction}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-bold text-muted focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            後で
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/event/events-page.test.tsx` に、既存の `vi.mock("@/lib/actions/event/events", ...)` を wrapup アクションも返すよう更新し、テストを追加。

まず mock 行を更新:

```ts
vi.mock("@/lib/actions/event/events", () => ({
  cancelEventAction: vi.fn(),
  completeEventAction: vi.fn(),
  snoozeEventWrapupAction: vi.fn()
}));
```

`makeEvent` は `wrapup_snoozed_until: null` を持たないので、テスト内で明示的に組み立てる。追加テスト:

```ts
it("期日超過・清算不要で30日以上たったイベントに確認帯を出す", async () => {
  const longAgo = new Date("2026-05-01T10:00:00Z").toISOString(); // vitest.setup の now=2026-07-01 より60日前
  const eventQuery = createEventQuery([
    {
      ...makeEvent("event-1", "先月の集まり"),
      status: "confirmed",
      wrapup_snoozed_until: null,
      plans: [
        {
          id: "plan-1",
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: longAgo,
          confirmed_end_at: longAgo,
          is_all_day: false
        }
      ]
    }
  ]);
  const rpc = createRpcResult(["event-1"], 1);
  const draftQuery = createDraftQuery(null);
  createSupabaseServerClient.mockResolvedValue({
    rpc,
    from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
  });

  render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

  expect(screen.getByText(/開催おつかれさまでした/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "完了にする" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "後で" })).toBeInTheDocument();
});

it("期日超過でも30日たっていなければ確認帯を出さない", async () => {
  const recent = new Date("2026-06-25T10:00:00Z").toISOString(); // now の6日前
  const eventQuery = createEventQuery([
    {
      ...makeEvent("event-1", "先週の集まり"),
      status: "confirmed",
      wrapup_snoozed_until: null,
      plans: [
        {
          id: "plan-1",
          status: "date_confirmed",
          settlement_status: "not_needed",
          confirmed_start_at: recent,
          confirmed_end_at: recent,
          is_all_day: false
        }
      ]
    }
  ]);
  const rpc = createRpcResult(["event-1"], 1);
  const draftQuery = createDraftQuery(null);
  createSupabaseServerClient.mockResolvedValue({
    rpc,
    from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
  });

  render(await EventsPage({ searchParams: Promise.resolve({ status: "completed" }) }));

  expect(screen.queryByText(/開催おつかれさまでした/)).not.toBeInTheDocument();
});
```

> 注: `vitest.setup.ts` は現在時刻を `2026-07-01T00:00:00+09:00` に固定している。`WRAPUP_PROMPT_FLOOR_ISO`（`2026-10-04`）はこの固定時刻より未来なので、そのままだと `promptDue` が floor に張り付いて帯が出ない。テストでは `event-wrapup` の floor を無効化する必要がある → **Step 3 でページ側が `getEventWrapupTimers` を直接使わず `shouldShowWrapupPrompt` を使い、`shouldShowWrapupPrompt` の内部 floor をテスト環境で回避できるよう、`WRAPUP_PROMPT_FLOOR_ISO` を `process.env.NODE_ENV === "test" ? "2000-01-01" : "2026-10-04"` にする。** `event-wrapup.ts` の定数定義をこの形に変更し、Task 2 のテストの `promptFloorIso` 明示も残す。

- [ ] **Step 3: `WRAPUP_PROMPT_FLOOR_ISO` をテスト環境で無効化**

`lib/domain/event/event-wrapup.ts`:

```ts
export const WRAPUP_PROMPT_FLOOR_ISO =
  process.env.NODE_ENV === "test" ? "2000-01-01" : "2026-10-04";
```

- [ ] **Step 4: `app/events/page.tsx` を更新**

(a) import 追加:

```ts
import { shouldShowWrapupPrompt } from "@/lib/domain/event/event-wrapup";
import { cancelEventAction, completeEventAction, snoozeEventWrapupAction } from "@/lib/actions/event/events";
import { EventWrapupActions } from "@/components/event/event-wrapup-actions";
```

(b) `EventRow` 型に `wrapup_snoozed_until: string | null;` を追加。

(c) events を再フェッチする select 文字列（`"id, title, category, start_date, end_date, location_name, status, created_at, event_members(status), plans(...)"`）に `wrapup_snoozed_until` を追加:

```ts
.select(
  "id, title, category, start_date, end_date, location_name, status, created_at, wrapup_snoozed_until, event_members(status), plans(id, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)"
)
```

(d) `EventCard` の `</Link>` の後、既存の `showCancel && !isEventLifecycleFinished(event)` ブロックの前に帯を追加:

```tsx
      </Link>
      {shouldShowWrapupPrompt(event) ? (
        <EventWrapupActions
          completeAction={completeEventAction.bind(null, event.id)}
          snoozeAction={snoozeEventWrapupAction.bind(null, event.id)}
        />
      ) : null}
      {showCancel && !isEventLifecycleFinished(event) ? (
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add components/event/event-wrapup-actions.tsx app/events/page.tsx lib/domain/event/event-wrapup.ts tests/event/events-page.test.tsx
git commit -m "feat(events): 一覧カードに wrapup 確認帯"
```

---

## Task 7: 自動完了の取り消しボタン（イベント詳細）

**Files:**
- Create: `components/event/event-reopen-action.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Test: `tests/event/event-detail-page.test.tsx`（既存に追記。無ければ `tests/event/event-reopen-action.test.tsx` を新規）

**Interfaces:**
- Consumes: `reopenEventAction`（Task 4）
- Produces: `EventReopenAction`（`{ action: (formData: FormData) => void | Promise<void> }`）

- [ ] **Step 1: クライアントコンポーネントを作る**

`components/event/event-reopen-action.tsx`:

```tsx
"use client";

import React from "react";

export function EventReopenAction({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="mt-4 rounded-control border border-line bg-sunken p-4">
      <p className="text-sm text-muted">
        このイベントは1ヶ月以上動きがなかったため自動で完了になりました。
      </p>
      <button
        type="submit"
        className="mt-2 inline-flex min-h-9 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-bold text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        完了を取り消す
      </button>
    </form>
  );
}
```

- [ ] **Step 2: 詳細ページの現状を確認**

Read: `app/events/[eventId]/page.tsx`（`event.status` / `isTerminalEventStatus` / owner 判定がある行を探す）。`event` を select する箇所に `wrapup_auto_done` を足す必要がある。owner 判定の変数名（例 `isOwner` / `canManage`）を確認する。

- [ ] **Step 3: 失敗するテストを書く**

`tests/event/event-reopen-action.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventReopenAction } from "@/components/event/event-reopen-action";

describe("EventReopenAction", () => {
  it("「完了を取り消す」ボタンを出し、押すと action を submit する", () => {
    const action = vi.fn();
    render(<EventReopenAction action={action} />);
    expect(screen.getByRole("button", { name: "完了を取り消す" })).toBeInTheDocument();
    expect(screen.getByText(/自動で完了になりました/)).toBeInTheDocument();
  });
});
```

（詳細ページ側の描画条件テストは、既存 `tests/event/event-detail-page.test.tsx` のパターンに合わせて「`status='done'` かつ `wrapup_auto_done=true` かつ owner のとき表示、それ以外は非表示」を追加する。既存テストのモック構造を読んでから書く。）

- [ ] **Step 4: テストが落ちることを確認**

Run: `npx vitest run tests/event/event-reopen-action.test.tsx --reporter=dot`
Expected: FAIL（コンポーネントが無い）

- [ ] **Step 5: 詳細ページに組み込む**

`app/events/[eventId]/page.tsx`:

(a) import: `import { EventReopenAction } from "@/components/event/event-reopen-action";` と `reopenEventAction` を `@/lib/actions/event/events` から。

(b) `event` の select に `wrapup_auto_done` を追加。

(c) owner かつ `event.status === "done"` かつ `event.wrapup_auto_done` のとき、`EventCancelAction` を出しているあたり（Step 2 で特定した箇所）に:

```tsx
{isOwner && event.status === "done" && event.wrapup_auto_done ? (
  <EventReopenAction action={reopenEventAction.bind(null, event.id)} />
) : null}
```

（`isOwner` は Step 2 で確認した実際の変数名に置き換える）

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/event/event-reopen-action.test.tsx tests/event/event-detail-page.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 7: 全体テスト・型・lint**

Run: `npx vitest run --reporter=dot`
Expected: PASS（全件）

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npx eslint .`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add components/event/event-reopen-action.tsx app/events/[eventId]/page.tsx tests/event/event-reopen-action.test.tsx tests/event/event-detail-page.test.tsx
git commit -m "feat(event): 自動完了イベントに「完了を取り消す」ボタン"
```

---

## Task 8: PR とリリース段取り

- [ ] **Step 1: ブランチを push して draft PR**

```bash
git push -u origin feat/event-auto-completion
gh pr create --draft --base main --title "イベントの自動完了（期日超過・清算不要）" --body "設計: docs/superpowers/specs/2026-09-06-event-auto-completion-design.md / 計画: docs/superpowers/plans/2026-09-06-event-auto-completion.md"
```

- [ ] **Step 2: `WRAPUP_PROMPT_FLOOR_ISO` を確定**

マージ予定日を見て `lib/domain/event/event-wrapup.ts` の `"2026-10-04"` を「マージ日 + 14日」に更新。コミット。

- [ ] **Step 3: CI 緑を確認 → Codex レビュー → マージ承認をユーザーに依頼**

- [ ] **Step 4: マージ後、migration 049 を本番適用（ユーザー作業）**

- [ ] **Step 5: `EVENT_WRAPUP_AUTO_DONE` は設定しない（dry-run）**。約1ヶ月、cron レスポンスの `wrapup.wouldAutoComplete` と Vercel ログの `[wrapup] would auto-complete` を確認。完了にすべきでないイベントが出ていないことを確認できたら Vercel の環境変数に `EVENT_WRAPUP_AUTO_DONE=on` を追加。

---

## Self-Review

**1. Spec coverage:**

| spec の要素 | 対応タスク |
|---|---|
| migration 049（`wrapup_snoozed_until` / `wrapup_auto_done` / index / kind 制約 / 90日超バックフィル） | Task 1 |
| 「最終開催日」の定義 | Task 2（`getEventLastScheduleTimestamp`） |
| タイマーの計算（保存しない・毎回導出） | Task 2（`getEventWrapupTimers`） |
| `isEventWrapupEligible` | Task 2 |
| cron の処理順（走査・プロンプト・自動 done・dry-run ログ） | Task 5 + Task 3（プランナー） |
| 冪等性（dedupe_key に promptDue 日付） | Task 3 |
| エラー処理（集計して返す・部分成功） | Task 5（`wrapupErrors`） |
| 通知の文面（dry-run / 本番の出し分け） | Task 3 |
| 案B 一覧カードの帯 | Task 6 |
| 案A ベル通知（新 kind 2種） | Task 3（kind）+ Task 5（生成） |
| Server Actions 3本 | Task 4 |
| reopen → planning | Task 4 |
| 既存「再調整を始める」は触らない | （変更なし。Task 対象外で正しい） |
| 「戻す」導線 | Task 7（詳細ページの「完了を取り消す」） |
| dry-run → 本番 切替チェックリスト | Task 8 |
| テスト（純粋関数・cron・actions・EventCard・スキーマ文字列） | Task 1〜7 各末尾 |

spec の「NotificationActionFilter への割り当ては当面『すべて』のみ」は、`filterNotificationsByActionFilter` が未知 kind を `actionFilterForKind` で null 扱いにするため自動的に「すべて」だけに出る（追加実装不要）。Task 3 実装時に `actionFilterForKind` を確認し、新 kind で null が返ることをテストで1行押さえる。

**2. Placeholder scan:** `WRAPUP_PROMPT_FLOOR_ISO` の日付は Task 8 Step 2 で確定する明示ステップあり。Task 7 Step 2「詳細ページの現状を確認」と Step 3 の「既存テストのモック構造を読んでから」は、既存コード依存のため実装者が読む前提の指示（プレースホルダではなく手順）。

**3. Type consistency:**
- `EventWrapupInput`（Task 2）= `EventListItem & { wrapup_snoozed_until?: string | null }`。`EventWrapupSweepEvent`（Task 3）はこれを継承。一貫。
- `getEventWrapupTimers` の options: Task 2 は `{ promptFloorIso?: string }`。Task 3 の `planEventWrapupSweep` options は `{ autoDoneEnabled: boolean; promptFloorIso?: string }` で、内部から `getEventWrapupTimers(event, { promptFloorIso: options.promptFloorIso })` を呼ぶ。一貫。
- `EventWrapupNotificationRow` の形（`user_id` / `kind` / `title` / `body` / `href` / `dedupe_key`）は cron の `notifications.upsert` が受ける形（snake_case）と一致。既存の `buildNotificationCandidate` は camelCase（`userId` / `dedupeKey`）で別物 → wrapup は独自 row を作るので混在しない。OK。
- Task 4 の `completeEventAction` などは `Promise<void>`。Task 6 は `.bind(null, event.id)` で `(formData: FormData) => ...` にして `<form action>` へ。一貫（既存 `cancelEventAction` と同じ渡し方）。
