# 当日の進行表（タイムスケジュール）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日程が確定した `plans` に、時刻付きの当日進行表（複数担当・分岐対応・いまここ表示）を追加する。

**Architecture:** `plan_timetable_items` と `plan_timetable_item_assignees` の2テーブルを追加し、
並び替え・日付グループ化・分岐検出・所要時間・いまここ判定は `lib/domain/plan-timetable.ts` の
純関数に閉じ込める。画面は `/plans/[planId]/timetable` のサーバーコンポーネントで、
更新は Server Actions。クライアント JS は「担当のトグルチップ」と「フォームを開いたときのスクロール」の2つだけ。

**Tech Stack:** Next.js App Router (Server Components / Server Actions) / Supabase (Postgres + RLS) / TypeScript / Tailwind / Vitest + Testing Library

**設計doc:** `docs/superpowers/specs/2026-08-03-plan-timetable-design.md`

## Global Constraints

- マイグレーション番号は **028**。`codex/performance-security-foundation` も 028 以降を使う予定なので、取り込み時に採番調整が要る
- テーブルへの `grant` は書かない。**024 も書いていない**（このプロジェクトの `grant` は関数に対してだけ）。設計docの「新テーブルの GRANT をコピーする」は 024 を見ると該当する記述が無く、Supabase の既定権限で足りている
- ドメイン関数は**現在時刻を引数で受け取る**。関数内で `new Date()` を呼ばない（`vitest.setup.ts` が Date を 2026-07-01T00:00:00+09:00 に固定している）
- 日付の境界は **JST 固定**。`Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })` で `YYYY-MM-DD` を作る。テスト環境の TZ に依存させない
- **時刻の表示も JST 固定にする。** `lib/format.ts` の `formatTime` / `formatDateTime` は `timeZone` を指定していないため、実行環境の TZ に従う。Vercel の Node.js ランタイムは UTC で、プロジェクトに `TZ` の設定は無い（`vercel.json` / `next.config` / `.env.example` のいずれにも無い）。開発機が JST なのでテストは通るが**本番では9時間ずれる**。進行表は時刻そのものが中身なので、`formatJstTime` を新設して使う（Task 7 Step 3）。既存の `formatTime` は他ページが依存しているのでこの計画では触らない。日付境界の JST 明示は既存の `app/page.tsx:69` の `tokyoDateKey` と同じ考え方
- `.tsx` では `import React from "react";` を明示する（プロジェクト規約）
- UI プリミティブは `@/components/ui` から import する（`ui-server.tsx` / `ui-client.tsx` を直接 import しない）
- 認証は `getCurrentUser()` / `getCurrentUserId()` 経由（`tests/no-raw-auth-getuser.test.ts` がガード）
- Supabase クエリの `error` を捨てない。`.single()` の `PGRST116`（0件）だけ `notFound()`、それ以外は `throw`
- 色トークンは既存のみ: canvas `#efe7d8` / surface `#fffdf7` / sunken `#f6f0e4` / ink `#262320` / muted `#6f665c` / subtle `#948a7d` / moss `#5f7d65` / pine `#344f43` / clay `#df7d69` / mist `#eff3ee`
- 全ページ `force-dynamic`。「いまここ」はサーバー描画時の時刻で決め、クライアントのタイマーは置かない

## 設計docに書かれていない決定（この計画で確定させる）

| 論点 | 決定 | 理由 |
|---|---|---|
| 終了時刻が無い**最後の**行の「いまここ」 | 開始したら光り続ける | 終了時刻を決める材料が無い。当日ページを開いて何も光らないより、最後の項目が残るほうが自然 |
| 終了時刻が開始時刻より前（22:00→2:00） | **翌日として保存する** | DB 制約 `end_at >= start_at` があるため、繰り上げないと INSERT が落ちる。日跨ぎは設計docが想定している |
| 分岐ブロックの終了時刻 | ブロック内の `end_at` の最大値 | 「合流」の見出しに使う |
| 担当が空の行が重なったとき | 行ごとに単独レーン | 設計doc「担当が空の行は単独レーン」をそのまま適用 |

## ファイル構成

**新規**

| ファイル | 責務 |
|---|---|
| `supabase/migrations/028_plan_timetable.sql` | 2テーブル・索引・トリガー・RLS |
| `lib/domain/plan-timetable.ts` | 型 + 純関数5つ（並び替え / 日付グループ / 分岐 / 所要時間 / いまここ） |
| `lib/actions/plan-timetable.ts` | 作成・更新・削除の Server Actions |
| `components/plan-timetable.tsx` | 進行表の一覧（Server Component） |
| `components/plan-timetable-form.tsx` | 追加・編集フォーム（`<details>`、Server Component） |
| `components/participant-toggle-chips.tsx` | 担当のトグルチップ（Client Component） |
| `components/details-scroll-into-view.tsx` | `<details>` を開いたら画面中央へ寄せる（Client Component） |
| `app/plans/[planId]/timetable/page.tsx` | ページ本体 |
| `app/plans/[planId]/timetable/loading.tsx` | スケルトン |
| `tests/supabase/plan-timetable.test.ts` | マイグレーションの文字列検証 |
| `tests/domain/plan-timetable.test.ts` | ドメイン純関数 |
| `tests/actions/plan-timetable.test.ts` | Server Actions |
| `tests/plan-timetable.test.tsx` | 一覧・フォームの描画 |

**変更**

| ファイル | 変更内容 |
|---|---|
| `lib/format.ts` | JST 固定の `formatJstTime` を追加（既存の `formatTime` は触らない） |
| `app/plans/[planId]/page.tsx:222` 付近 | `isConfirmed` のとき「当日の進行表へ」リンクを追加 |
| `tests/route-loading-skeletons.test.tsx` | 進行表ルートのスケルトンを追加 |
| `tests/format.test.ts` | `formatJstTime` のテストを追加 |

---

### Task 1: マイグレーション 028

**Files:**
- Create: `supabase/migrations/028_plan_timetable.sql`
- Test: `tests/supabase/plan-timetable.test.ts`

**Interfaces:**
- Consumes: 既存の `public.is_event_member(uuid)`（017 で定義・grant 済み）と `public.set_updated_at()`
- Produces: テーブル `public.plan_timetable_items`（列 `id, plan_id, start_at, end_at, title, note, created_by_user_id, created_at, updated_at`）と `public.plan_timetable_item_assignees`（列 `item_id, participant_id, created_at`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/supabase/plan-timetable.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/028_plan_timetable.sql");

/** コメント行に退避したガードを「ある」と誤判定しないため、検証前に落とす。 */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("plan timetable migration", () => {
  it("日程調整に紐づく進行表の行を作る", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("create table if not exists public.plan_timetable_items");
    expect(migration).toContain("plan_id uuid not null references public.plans(id) on delete cascade");
    expect(migration).toContain("start_at timestamptz not null");
    expect(migration).toContain("end_at timestamptz");
  });

  it("終了時刻は開始時刻より前にできない", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("check (end_at is null or end_at >= start_at)");
  });

  it("担当は participants を指す", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("create table if not exists public.plan_timetable_item_assignees");
    expect(migration).toContain("participant_id uuid not null references public.participants(id) on delete cascade");
    expect(migration).toContain("primary key (item_id, participant_id)");
  });

  it("イベントメンバーだけが読み書きできる", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("alter table public.plan_timetable_items enable row level security");
    expect(migration).toContain("alter table public.plan_timetable_item_assignees enable row level security");
    expect(migration).toContain("public.is_event_member(");

    for (const command of ["for select", "for insert", "for update", "for delete"]) {
      expect(migration).toContain(command);
    }
  });

  it("作成者は自分自身でなければならない", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("created_by_user_id = auth.uid()");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/supabase/plan-timetable.test.ts`
Expected: FAIL（`ENOENT: no such file or directory ... 028_plan_timetable.sql`）

- [ ] **Step 3: マイグレーションを書く**

`supabase/migrations/028_plan_timetable.sql`:

```sql
-- 当日の進行表。日程が確定してはじめて書けるものなので、events ではなく plans に紐づける。
-- 担当は participants を指す。user_id が nullable なのでアプリ未登録の人にも担当を付けられ、
-- 退会(023)でも行が残るため表示が壊れない。

create table if not exists public.plan_timetable_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 100),
  note text check (note is null or char_length(note) <= 500),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_timetable_items_range_check check (end_at is null or end_at >= start_at)
);

create index if not exists plan_timetable_items_plan_id_start_at_idx
  on public.plan_timetable_items(plan_id, start_at);

create table if not exists public.plan_timetable_item_assignees (
  item_id uuid not null references public.plan_timetable_items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, participant_id)
);

create index if not exists plan_timetable_item_assignees_participant_id_idx
  on public.plan_timetable_item_assignees(participant_id);

drop trigger if exists plan_timetable_items_set_updated_at on public.plan_timetable_items;

create trigger plan_timetable_items_set_updated_at
before update on public.plan_timetable_items
for each row execute function public.set_updated_at();

alter table public.plan_timetable_items enable row level security;
alter table public.plan_timetable_item_assignees enable row level security;

-- is_event_member は event_id を取る。進行表は plan_id しか持たないのでサブクエリで引く。
-- テーブル名で修飾するのは、サブクエリ内の plans の列と行の plan_id を紛れさせないため。
drop policy if exists "Event members can view timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can add timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can update timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can delete timetable items" on public.plan_timetable_items;

create policy "Event members can view timetable items"
on public.plan_timetable_items
for select
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

create policy "Event members can add timetable items"
on public.plan_timetable_items
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

-- 担当の付け替えや時刻の修正は、誰が作ったものでもメンバーなら操作できる（024 と同じ考え方）。
create policy "Event members can update timetable items"
on public.plan_timetable_items
for update
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
)
with check (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

create policy "Event members can delete timetable items"
on public.plan_timetable_items
for delete
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

drop policy if exists "Event members can view timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can add timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can update timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can delete timetable assignees" on public.plan_timetable_item_assignees;

create policy "Event members can view timetable assignees"
on public.plan_timetable_item_assignees
for select
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can add timetable assignees"
on public.plan_timetable_item_assignees
for insert
to authenticated
with check (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can update timetable assignees"
on public.plan_timetable_item_assignees
for update
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
)
with check (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can delete timetable assignees"
on public.plan_timetable_item_assignees
for delete
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/supabase/plan-timetable.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: ミューテーション検査**

`028_plan_timetable.sql` から `constraint plan_timetable_items_range_check check (end_at is null or end_at >= start_at)` の行を一時的に消して
`npx vitest run tests/supabase/plan-timetable.test.ts` を実行し、「終了時刻は開始時刻より前にできない」が **FAIL することを確認**してから元に戻す。
同様に `created_by_user_id = auth.uid()` を消して該当テストが落ちることを確認する。落ちなければテストが守れていないので直す。

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/028_plan_timetable.sql tests/supabase/plan-timetable.test.ts
git commit -m "feat: add plan timetable tables and policies"
```

---

### Task 2: ドメイン — 型・並び替え・日付グループ化

**Files:**
- Create: `lib/domain/plan-timetable.ts`
- Test: `tests/domain/plan-timetable.test.ts`

**Interfaces:**
- Produces:
  - `type TimetableAssignee = { participantId: string; displayName: string; status: string }`
  - `type TimetableItem = { id: string; startAt: string; endAt: string | null; title: string; note: string | null; createdAt: string; assignees: TimetableAssignee[] }`
  - `type TimetableDateGroup = { dateKey: string; items: TimetableItem[] }`
  - `toJstDateKey(value: string): string`
  - `sortTimetableItems(items: TimetableItem[]): TimetableItem[]`
  - `groupTimetableItemsByDate(items: TimetableItem[]): TimetableDateGroup[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/plan-timetable.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  groupTimetableItemsByDate,
  sortTimetableItems,
  toJstDateKey,
  type TimetableItem
} from "@/lib/domain/plan-timetable";

/** テストごとに必要な項目だけ上書きする。 */
function item(overrides: Partial<TimetableItem> & Pick<TimetableItem, "id" | "startAt">): TimetableItem {
  return {
    endAt: null,
    title: `項目 ${overrides.id}`,
    note: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    assignees: [],
    ...overrides
  };
}

describe("toJstDateKey", () => {
  it("JSTの日付を返す", () => {
    expect(toJstDateKey("2026-08-15T10:00:00+09:00")).toBe("2026-08-15");
  });

  it("UTCで前日になる時刻でもJSTの日付になる", () => {
    // 2026-08-15T22:00+09:00 は UTC では 08-15T13:00。翌日をまたぐ 00:30+09:00 で確認する。
    expect(toJstDateKey("2026-08-16T00:30:00+09:00")).toBe("2026-08-16");
  });
});

describe("sortTimetableItems", () => {
  it("開始時刻の昇順で並べる", () => {
    const sorted = sortTimetableItems([
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("同時刻は作成順で決着する", () => {
    const sorted = sortTimetableItems([
      item({ id: "late", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-02T00:00:00+09:00" }),
      item({ id: "early", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:00:00+09:00" })
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("元の配列を書き換えない", () => {
    const items = [
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" })
    ];

    sortTimetableItems(items);

    expect(items.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("groupTimetableItemsByDate", () => {
  it("単日なら1グループにまとめる", () => {
    const groups = groupTimetableItemsByDate([
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe("2026-08-15");
    expect(groups[0].items.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("複数日は日付ごとに分ける", () => {
    const groups = groupTimetableItemsByDate([
      item({ id: "day2", startAt: "2026-08-16T09:00:00+09:00" }),
      item({ id: "day1", startAt: "2026-08-15T09:00:00+09:00" })
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual(["2026-08-15", "2026-08-16"]);
  });

  it("日をまたぐ項目は開始日のグループに入れる", () => {
    const groups = groupTimetableItemsByDate([
      item({
        id: "night",
        startAt: "2026-08-15T22:00:00+09:00",
        endAt: "2026-08-16T02:00:00+09:00"
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dateKey).toBe("2026-08-15");
  });

  it("空なら空配列を返す", () => {
    expect(groupTimetableItemsByDate([])).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: FAIL（`Failed to resolve import "@/lib/domain/plan-timetable"`）

- [ ] **Step 3: 実装する**

`lib/domain/plan-timetable.ts`:

```ts
export type TimetableAssignee = {
  participantId: string;
  displayName: string;
  /** participants.status。declined / cancelled は取り消し線で出し続ける。 */
  status: string;
};

export type TimetableItem = {
  id: string;
  startAt: string;
  endAt: string | null;
  title: string;
  note: string | null;
  createdAt: string;
  assignees: TimetableAssignee[];
};

export type TimetableDateGroup = {
  dateKey: string;
  items: TimetableItem[];
};

// 日付の境界は JST 固定。テスト環境や Vercel の TZ に左右させない。
const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function toJstDateKey(value: string): string {
  return jstDateFormatter.format(new Date(value));
}

function timeOf(value: string): number {
  return new Date(value).getTime();
}

/** 開始時刻の昇順。同時刻は作成順で決着する。 */
export function sortTimetableItems(items: TimetableItem[]): TimetableItem[] {
  return [...items].sort(
    (a, b) => timeOf(a.startAt) - timeOf(b.startAt) || timeOf(a.createdAt) - timeOf(b.createdAt)
  );
}

/** 日をまたぐ項目は開始日のグループに入れる。見出しを出すかどうかは呼び出し側が決める。 */
export function groupTimetableItemsByDate(items: TimetableItem[]): TimetableDateGroup[] {
  const groups: TimetableDateGroup[] = [];

  for (const item of sortTimetableItems(items)) {
    const dateKey = toJstDateKey(item.startAt);
    const last = groups[groups.length - 1];

    if (last && last.dateKey === dateKey) {
      last.items.push(item);
      continue;
    }

    groups.push({ dateKey, items: [item] });
  }

  return groups;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: PASS（10件）

- [ ] **Step 5: ミューテーション検査**

`sortTimetableItems` の `|| timeOf(a.createdAt) - timeOf(b.createdAt)` を消して
「同時刻は作成順で決着する」が FAIL することを確認してから戻す。
`toJstDateKey` の `timeZone: "Asia/Tokyo"` を消して「JSTの日付を返す」が
（TZ が Asia/Tokyo でない環境では）FAIL することを確認する。開発機が JST で落ちない場合は
`TZ=UTC npx vitest run tests/domain/plan-timetable.test.ts` で確認する。

- [ ] **Step 6: コミット**

```bash
git add lib/domain/plan-timetable.ts tests/domain/plan-timetable.test.ts
git commit -m "feat: add timetable sorting and date grouping"
```

---

### Task 3: ドメイン — 分岐ブロックの検出

**Files:**
- Modify: `lib/domain/plan-timetable.ts`（追記）
- Test: `tests/domain/plan-timetable.test.ts`（追記）

**Interfaces:**
- Consumes: Task 2 の `TimetableItem` / `TimetableAssignee` / `sortTimetableItems`
- Produces:
  - `type TimetableLane = { key: string; assignees: TimetableAssignee[]; items: TimetableItem[] }`
  - `type TimetableBlock = { kind: "single"; item: TimetableItem } | { kind: "branch"; startAt: string; endAt: string; lanes: TimetableLane[] }`
  - `buildTimetableBlocks(items: TimetableItem[]): TimetableBlock[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/domain/plan-timetable.test.ts` に追記（`item` ヘルパーは Task 2 のものを使う）。
先頭の import に `buildTimetableBlocks` を足す:

```ts
import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  sortTimetableItems,
  toJstDateKey,
  type TimetableItem
} from "@/lib/domain/plan-timetable";
```

```ts
function assignee(id: string, name: string) {
  return { participantId: id, displayName: name, status: "confirmed" };
}

describe("buildTimetableBlocks", () => {
  it("重ならない行はそれぞれ単独のブロックになる", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T09:00:00+09:00", endAt: "2026-08-15T10:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T10:00:00+09:00", endAt: "2026-08-15T11:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.kind === "single")).toBe(true);
  });

  it("終了時刻が無い同時刻の2行を分岐と判定しない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "gather", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "reception", startAt: "2026-08-15T13:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.kind)).toEqual(["single", "single"]);
  });

  it("終了時刻を持つ行同士が重なると分岐ブロックになる", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "sea",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T16:00:00+09:00",
        assignees: [assignee("p2", "ゆうき")]
      })
    ]);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.startAt).toBe("2026-08-15T13:00:00+09:00");
    // 合流は end_at の最大値。
    expect(new Date(block.endAt).toISOString()).toBe(new Date("2026-08-15T16:00:00+09:00").toISOString());
    expect(block.lanes).toHaveLength(2);
  });

  it("重なりを推移的につなげる", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:30:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "c", startAt: "2026-08-15T14:30:00+09:00", endAt: "2026-08-15T16:00:00+09:00" })
    ]);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes.flatMap((lane) => lane.items.map((entry) => entry.id)).sort()).toEqual(["a", "b", "c"]);
  });

  it("同じ担当の行は同じレーンに時刻順で積む", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "sea1",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T14:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "sea2",
        startAt: "2026-08-15T14:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p1", "あかり")]
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p2", "ゆうき")]
      })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
    const seaLane = block.lanes.find((lane) => lane.assignees[0]?.participantId === "p1");
    expect(seaLane?.items.map((entry) => entry.id)).toEqual(["sea1", "sea2"]);
  });

  it("担当の並び順が違っても同じレーンにまとめる", () => {
    const blocks = buildTimetableBlocks([
      item({
        id: "x",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T14:00:00+09:00",
        assignees: [assignee("p1", "あかり"), assignee("p2", "ゆうき")]
      }),
      item({
        id: "y",
        startAt: "2026-08-15T13:30:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p2", "ゆうき"), assignee("p1", "あかり")]
      }),
      item({
        id: "z",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        assignees: [assignee("p3", "そら")]
      })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
  });

  it("担当が空の行は重なっても行ごとに別レーンにする", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:30:00+09:00", endAt: "2026-08-15T14:00:00+09:00" })
    ]);

    const block = blocks[0];
    if (block.kind !== "branch") throw new Error("分岐ブロックになっていない");
    expect(block.lanes).toHaveLength(2);
  });

  it("終了時刻の無い行が間に挟まっても分岐は壊れない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "sea", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" }),
      item({ id: "memo", startAt: "2026-08-15T13:30:00+09:00" }),
      item({ id: "cafe", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T16:00:00+09:00" })
    ]);

    const branchBlocks = blocks.filter((block) => block.kind === "branch");
    expect(branchBlocks).toHaveLength(1);
    expect(blocks.filter((block) => block.kind === "single")).toHaveLength(1);
  });

  it("終わりと始まりが接するだけなら重なりとみなさない", () => {
    const blocks = buildTimetableBlocks([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" })
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["single", "single"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: FAIL（`buildTimetableBlocks is not a function` / import エラー）

- [ ] **Step 3: 実装する**

`lib/domain/plan-timetable.ts` に追記:

```ts
export type TimetableLane = {
  key: string;
  assignees: TimetableAssignee[];
  items: TimetableItem[];
};

export type TimetableBlock =
  | { kind: "single"; item: TimetableItem }
  | { kind: "branch"; startAt: string; endAt: string; lanes: TimetableLane[] };

/** 担当の集合でレーンを決める。担当が空の行は行ごとに単独レーンにする。 */
function laneKeyOf(item: TimetableItem): string {
  if (item.assignees.length === 0) {
    return `item:${item.id}`;
  }

  return item.assignees
    .map((assignee) => assignee.participantId)
    .slice()
    .sort()
    .join(",");
}

function buildLanes(members: TimetableItem[]): TimetableLane[] {
  const lanes: TimetableLane[] = [];
  const laneByKey = new Map<string, TimetableLane>();

  for (const item of members) {
    const key = laneKeyOf(item);
    const existing = laneByKey.get(key);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    const lane: TimetableLane = { key, assignees: item.assignees, items: [item] };
    laneByKey.set(key, lane);
    lanes.push(lane);
  }

  return lanes;
}

/**
 * end_at を持つ行同士の時間帯の重なりだけを分岐とみなす。
 * end_at の無い行（「13:00 集合」「13:00 受付開始」）を分岐と誤判定しないため。
 * 重なりは推移的につながる（A と B、B と C が重なれば A・B・C で1ブロック）。
 */
export function buildTimetableBlocks(items: TimetableItem[]): TimetableBlock[] {
  const sorted = sortTimetableItems(items);
  const timed = sorted.filter((item): item is TimetableItem & { endAt: string } => item.endAt !== null);

  const clusterIdByItemId = new Map<string, number>();
  const membersByClusterId = new Map<number, TimetableItem[]>();
  let clusterId = 0;
  let clusterEnd = Number.NEGATIVE_INFINITY;

  for (const item of timed) {
    const start = timeOf(item.startAt);
    const end = timeOf(item.endAt);

    // 終わりと始まりが接するだけ（start === clusterEnd）は重なりにしない。
    if (start >= clusterEnd) {
      clusterId += 1;
      clusterEnd = end;
    } else {
      clusterEnd = Math.max(clusterEnd, end);
    }

    clusterIdByItemId.set(item.id, clusterId);
    const members = membersByClusterId.get(clusterId) ?? [];
    members.push(item);
    membersByClusterId.set(clusterId, members);
  }

  const blocks: TimetableBlock[] = [];
  const emitted = new Set<number>();

  for (const item of sorted) {
    const id = clusterIdByItemId.get(item.id);
    const members = id === undefined ? undefined : membersByClusterId.get(id);

    if (id === undefined || !members || members.length === 1) {
      blocks.push({ kind: "single", item });
      continue;
    }

    if (emitted.has(id)) {
      continue;
    }

    emitted.add(id);
    blocks.push({
      kind: "branch",
      startAt: members[0].startAt,
      endAt: new Date(Math.max(...members.map((member) => timeOf(member.endAt as string)))).toISOString(),
      lanes: buildLanes(members)
    });
  }

  return blocks;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: PASS（20件）

- [ ] **Step 5: ミューテーション検査**

3つ試して、いずれも対応するテストが FAIL することを確認してから戻す。

1. `timed` の絞り込みを `sorted` に変える（`const timed = sorted;` と `end` を 0 扱い）→「終了時刻が無い同時刻の2行を分岐と判定しない」が落ちること
2. `start >= clusterEnd` を `start > clusterEnd` に変える →「終わりと始まりが接するだけなら重なりとみなさない」が落ちること
3. `laneKeyOf` の `.sort()` を消す →「担当の並び順が違っても同じレーンにまとめる」が落ちること

- [ ] **Step 6: コミット**

```bash
git add lib/domain/plan-timetable.ts tests/domain/plan-timetable.test.ts
git commit -m "feat: detect branching blocks in timetable"
```

---

### Task 4: ドメイン — 所要時間と「いまここ」

**Files:**
- Modify: `lib/domain/plan-timetable.ts`（追記）
- Test: `tests/domain/plan-timetable.test.ts`（追記）

**Interfaces:**
- Consumes: Task 2 の `TimetableItem` / `sortTimetableItems`
- Produces:
  - `resolveTimetableDurations(items: TimetableItem[]): Record<string, number>`（分。出せない項目はキーごと無い）
  - `resolveCurrentTimetableItemIds(items: TimetableItem[], now: Date): Set<string>`

- [ ] **Step 1: 失敗するテストを書く**

import に2つ追加して、`tests/domain/plan-timetable.test.ts` に追記:

```ts
describe("resolveTimetableDurations", () => {
  it("終了時刻があればその差を分で返す", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:30:00+09:00" })
    ]);

    expect(durations.a).toBe(90);
  });

  it("終了時刻が無ければ次に始まる行との差にする", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T13:45:00+09:00" })
    ]);

    expect(durations.a).toBe(45);
  });

  it("同時刻の行は飛ばして次に始まる行を探す", () => {
    const durations = resolveTimetableDurations([
      item({ id: "gather", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:00:00+09:00" }),
      item({ id: "reception", startAt: "2026-08-15T13:00:00+09:00", createdAt: "2026-08-01T00:01:00+09:00" }),
      item({ id: "start", startAt: "2026-08-15T13:30:00+09:00" })
    ]);

    expect(durations.gather).toBe(30);
    expect(durations.reception).toBe(30);
  });

  it("最後の行に終了時刻が無ければ所要時間を出さない", () => {
    const durations = resolveTimetableDurations([
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "last", startAt: "2026-08-15T17:00:00+09:00" })
    ]);

    expect(durations.last).toBeUndefined();
  });

  it("不均等に二手へ分かれても、次の行との差で上書きしない", () => {
    // 海チーム 13:00-15:00 / カフェ組 13:00-16:00。
    // 「次に始まる行との差」で計算すると海チームが 0 分になってしまう。
    const durations = resolveTimetableDurations([
      item({
        id: "sea",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        createdAt: "2026-08-01T00:00:00+09:00"
      }),
      item({
        id: "cafe",
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T16:00:00+09:00",
        createdAt: "2026-08-01T00:01:00+09:00"
      })
    ]);

    expect(durations.sea).toBe(120);
    expect(durations.cafe).toBe(180);
  });
});

describe("resolveCurrentTimetableItemIds", () => {
  const schedule = [
    item({ id: "a", startAt: "2026-08-15T13:00:00+09:00", endAt: "2026-08-15T14:00:00+09:00" }),
    item({ id: "b", startAt: "2026-08-15T14:00:00+09:00", endAt: "2026-08-15T15:00:00+09:00" })
  ];

  it("開始前は空集合を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T12:00:00+09:00"));

    expect(current.size).toBe(0);
  });

  it("進行中の行を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T13:30:00+09:00"));

    expect([...current]).toEqual(["a"]);
  });

  it("すべて終わったら空集合を返す", () => {
    const current = resolveCurrentTimetableItemIds(schedule, new Date("2026-08-15T16:00:00+09:00"));

    expect(current.size).toBe(0);
  });

  it("分岐中は複数の行が同時に返る", () => {
    const current = resolveCurrentTimetableItemIds(
      [
        item({
          id: "sea",
          startAt: "2026-08-15T13:00:00+09:00",
          endAt: "2026-08-15T15:00:00+09:00",
          createdAt: "2026-08-01T00:00:00+09:00"
        }),
        item({
          id: "cafe",
          startAt: "2026-08-15T13:00:00+09:00",
          endAt: "2026-08-15T16:00:00+09:00",
          createdAt: "2026-08-01T00:01:00+09:00"
        })
      ],
      new Date("2026-08-15T14:00:00+09:00")
    );

    expect([...current].sort()).toEqual(["cafe", "sea"]);
  });

  it("終了時刻が無い行は次に始まる行までを進行中とみなす", () => {
    const items = [
      item({ id: "a", startAt: "2026-08-15T13:00:00+09:00" }),
      item({ id: "b", startAt: "2026-08-15T14:00:00+09:00" })
    ];

    expect([...resolveCurrentTimetableItemIds(items, new Date("2026-08-15T13:30:00+09:00"))]).toEqual(["a"]);
    expect([...resolveCurrentTimetableItemIds(items, new Date("2026-08-15T14:30:00+09:00"))]).toEqual(["b"]);
  });

  it("終了時刻の無い最後の行は始まったあとも進行中のままにする", () => {
    const current = resolveCurrentTimetableItemIds(
      [item({ id: "last", startAt: "2026-08-15T17:00:00+09:00" })],
      new Date("2026-08-15T23:00:00+09:00")
    );

    expect([...current]).toEqual(["last"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: FAIL（`resolveTimetableDurations is not a function`）

- [ ] **Step 3: 実装する**

`lib/domain/plan-timetable.ts` に追記:

```ts
/** 自分より後に「別の時刻で」始まる最初の行の開始時刻。同時刻の行は飛ばす。 */
function nextStartAfter(sorted: TimetableItem[], index: number, start: number): number | null {
  for (let cursor = index + 1; cursor < sorted.length; cursor += 1) {
    const candidate = timeOf(sorted[cursor].startAt);

    if (candidate > start) {
      return candidate;
    }
  }

  return null;
}

/**
 * 所要時間（分）。end_at があればそれを使う。
 * 無ければ次に始まる行との差で推定し、次が無ければ出さない。
 */
export function resolveTimetableDurations(items: TimetableItem[]): Record<string, number> {
  const sorted = sortTimetableItems(items);
  const durations: Record<string, number> = {};

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const start = timeOf(item.startAt);
    const end = item.endAt ? timeOf(item.endAt) : nextStartAfter(sorted, index, start);

    if (end === null) {
      continue;
    }

    durations[item.id] = Math.round((end - start) / 60000);
  }

  return durations;
}

/**
 * 「いまここ」の id 集合。二手に分かれている間は複数が同時に進行するため集合で返す。
 * 終了時刻を決められない最後の行は、始まったあとも進行中のままにする。
 */
export function resolveCurrentTimetableItemIds(items: TimetableItem[], now: Date): Set<string> {
  const sorted = sortTimetableItems(items);
  const nowTime = now.getTime();
  const current = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const start = timeOf(item.startAt);

    if (start > nowTime) {
      continue;
    }

    const end = item.endAt ? timeOf(item.endAt) : nextStartAfter(sorted, index, start);

    if (end === null || end > nowTime) {
      current.add(item.id);
    }
  }

  return current;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/domain/plan-timetable.test.ts`
Expected: PASS（32件）

- [ ] **Step 5: ミューテーション検査**

2つ試して、対応するテストが FAIL することを確認してから戻す。

1. `resolveTimetableDurations` の三項を `nextStartAfter(...)` 固定にする →「不均等に二手へ分かれても〜」が落ちること
2. `nextStartAfter` の `candidate > start` を `candidate >= start` に変える →「同時刻の行は飛ばして次に始まる行を探す」が落ちること

- [ ] **Step 6: コミット**

```bash
git add lib/domain/plan-timetable.ts tests/domain/plan-timetable.test.ts
git commit -m "feat: compute timetable durations and current items"
```

---

### Task 5: Server Actions

**Files:**
- Create: `lib/actions/plan-timetable.ts`
- Test: `tests/actions/plan-timetable.test.ts`

**Interfaces:**
- Consumes: `toJstDateKey`（Task 2）、`createSupabaseServerClient` / `getCurrentUser`（`@/lib/supabase/server`）
- Produces:
  - `createPlanTimetableItemAction(planId: string, formData: FormData): Promise<void>`
  - `updatePlanTimetableItemAction(planId: string, itemId: string, formData: FormData): Promise<void>`
  - `deletePlanTimetableItemAction(planId: string, itemId: string): Promise<void>`
- フォームのフィールド名: `date`（任意）/ `start_time` / `end_time`（任意）/ `title` / `note`（任意）/ `participant_ids`（複数）

- [ ] **Step 1: 失敗するテストを書く**

`tests/actions/plan-timetable.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getCurrentUser, redirect, revalidatePath } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser }));

import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction,
  updatePlanTimetableItemAction
} from "@/lib/actions/plan-timetable";

const userId = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

type Recorded = {
  inserts: { table: string; values: unknown }[];
  updates: { table: string; values: Record<string, unknown> }[];
  deletes: string[];
};

function createSupabaseMock({
  plan = { id: planId, event_id: eventId, status: "date_confirmed", confirmed_start_at: "2026-08-15T04:00:00+00:00" },
  membership = { id: "membership-1" }
}: {
  plan?: { id: string; event_id: string; status: string; confirmed_start_at: string | null } | null;
  membership?: { id: string } | null;
} = {}) {
  const recorded: Recorded = { inserts: [], updates: [], deletes: [] };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.insert = vi.fn((values: unknown) => {
      recorded.inserts.push({ table, values });
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      recorded.updates.push({ table, values });
      return builder;
    });
    builder.delete = vi.fn(() => {
      recorded.deletes.push(table);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "plans") return { data: plan, error: null };
      if (table === "event_members") return { data: membership, error: null };
      return { data: null, error: null };
    });
    builder.single = vi.fn(async () => {
      if (table === "plan_timetable_items") return { data: { id: itemId }, error: null };
      return { data: null, error: null };
    });
    builder.then = (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  });

  return { client: { from }, recorded };
}

function timetableFormData(fields: Record<string, string>, participantIds: string[] = []) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  for (const participantId of participantIds) {
    formData.append("participant_ids", participantId);
  }
  return formData;
}

describe("createPlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("参加していないイベントの進行表には追加できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(recorded.inserts).toEqual([]);
  });

  it("日程が確定していない日程調整には追加できない", async () => {
    const { client, recorded } = createSupabaseMock({
      plan: { id: planId, event_id: eventId, status: "adjusting", confirmed_start_at: null }
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("日程が確定していない");
    expect(recorded.inserts).toEqual([]);
  });

  it("日付が無ければ開催日のJST日付を使う", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    const insert = recorded.inserts.find((entry) => entry.table === "plan_timetable_items");
    const values = insert?.values as Record<string, unknown>;
    // 2026-08-15T04:00Z = JST 13:00 なので開催日は 2026-08-15。
    expect(new Date(values.start_at as string).toISOString()).toBe(
      new Date("2026-08-15T13:00:00+09:00").toISOString()
    );
    expect(values.end_at).toBeNull();
    expect(values.created_by_user_id).toBe(userId);
  });

  it("終了時刻が開始より前なら翌日として保存する", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "花火", start_time: "22:00", end_time: "02:00" })
    );

    const values = recorded.inserts.find((entry) => entry.table === "plan_timetable_items")
      ?.values as Record<string, unknown>;
    expect(new Date(values.end_at as string).toISOString()).toBe(
      new Date("2026-08-16T02:00:00+09:00").toISOString()
    );
  });

  it("担当を複数付けられる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p2"])
    );

    const assigneeInsert = recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([
      { item_id: itemId, participant_id: "p1" },
      { item_id: itemId, participant_id: "p2" }
    ]);
  });

  it("同じ担当を二重に送っても1回だけ入れる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(
      planId,
      timetableFormData({ title: "海で泳ぐ", start_time: "13:00" }, ["p1", "p1"])
    );

    const assigneeInsert = recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees");
    expect(assigneeInsert?.values).toEqual([{ item_id: itemId, participant_id: "p1" }]);
  });

  it("担当が無ければ担当テーブルに書き込まない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "13:00" }));

    expect(recorded.inserts.some((entry) => entry.table === "plan_timetable_item_assignees")).toBe(false);
  });

  it("空のタイトルは受け付けない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "   ", start_time: "13:00" }))
    ).rejects.toThrow("進行の名前を入力してください");
    expect(recorded.inserts).toEqual([]);
  });

  it("開始時刻が無ければ受け付けない", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      createPlanTimetableItemAction(planId, timetableFormData({ title: "集合", start_time: "" }))
    ).rejects.toThrow("開始時刻を入力してください");
    expect(recorded.inserts).toEqual([]);
  });
});

describe("updatePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("担当を入れ替える（いったん全部消してから入れ直す）", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await updatePlanTimetableItemAction(
      planId,
      itemId,
      timetableFormData({ title: "集合", start_time: "13:00" }, ["p2"])
    );

    expect(recorded.updates[0]).toMatchObject({ table: "plan_timetable_items" });
    expect(recorded.deletes).toContain("plan_timetable_item_assignees");
    expect(
      recorded.inserts.find((entry) => entry.table === "plan_timetable_item_assignees")?.values
    ).toEqual([{ item_id: itemId, participant_id: "p2" }]);
  });

  it("参加していないイベントの進行表は更新できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      updatePlanTimetableItemAction(planId, itemId, timetableFormData({ title: "集合", start_time: "13:00" }))
    ).rejects.toThrow("この進行表を編集する権限がありません");
    expect(recorded.updates).toEqual([]);
  });
});

describe("deletePlanTimetableItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: userId });
  });

  it("メンバーなら削除できる", async () => {
    const { client, recorded } = createSupabaseMock();
    createSupabaseServerClient.mockResolvedValue(client);

    await deletePlanTimetableItemAction(planId, itemId);

    expect(recorded.deletes).toContain("plan_timetable_items");
  });

  it("参加していないイベントの進行表は削除できない", async () => {
    const { client, recorded } = createSupabaseMock({ membership: null });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(deletePlanTimetableItemAction(planId, itemId)).rejects.toThrow(
      "この進行表を編集する権限がありません"
    );
    expect(recorded.deletes).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/actions/plan-timetable.test.ts`
Expected: FAIL（`Failed to resolve import "@/lib/actions/plan-timetable"`）

- [ ] **Step 3: 実装する**

`lib/actions/plan-timetable.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toJstDateKey } from "@/lib/domain/plan-timetable";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const MAX_TITLE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * 進行表を編集できるのは、日程が確定した plan の、参加済みイベントメンバーだけ。
 * 未確定 plan の進行表は閲覧だけできる（設計docの決定）。
 */
async function requireTimetableEditor(planId: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, event_id, status, confirmed_start_at")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    throw new Error(`日程調整の取得に失敗しました: ${planError.message}`);
  }
  if (!plan) {
    throw new Error("日程調整が見つかりません。");
  }
  if (plan.status !== "date_confirmed") {
    throw new Error("日程が確定していない日程調整の進行表は編集できません。");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("event_members")
    .select("id")
    .eq("event_id", plan.event_id)
    .eq("user_id", user.id)
    .eq("status", "joined")
    .maybeSingle();

  if (membershipError) {
    throw new Error(`参加状況の確認に失敗しました: ${membershipError.message}`);
  }
  if (!membership) {
    throw new Error("この進行表を編集する権限がありません。");
  }

  return { supabase, user, plan };
}

/** JSTの日付と時刻からタイムスタンプを作る。DBは timestamptz なのでオフセットを明示する。 */
function toJstTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

function readTitle(formData: FormData): string {
  const title = formData.get("title")?.toString().trim() ?? "";

  if (title.length === 0) {
    throw new Error("進行の名前を入力してください。");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`名前は${MAX_TITLE_LENGTH}文字以内で入力してください。`);
  }

  return title;
}

function readNote(formData: FormData): string | null {
  const note = formData.get("note")?.toString().trim() ?? "";

  if (note.length === 0) {
    return null;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(`メモは${MAX_NOTE_LENGTH}文字以内で入力してください。`);
  }

  return note;
}

function readSchedule(formData: FormData, fallbackDate: string) {
  const date = formData.get("date")?.toString().trim() || fallbackDate;
  const startTime = formData.get("start_time")?.toString().trim() ?? "";
  const endTime = formData.get("end_time")?.toString().trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("日付を選んでください。");
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("開始時刻を入力してください。");
  }

  const startAt = toJstTimestamp(date, startTime);

  if (endTime.length === 0) {
    return { startAt, endAt: null };
  }
  if (!/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("終了時刻の形式が正しくありません。");
  }

  const endTimestamp = new Date(toJstTimestamp(date, endTime)).getTime();
  const startTimestamp = new Date(startAt).getTime();
  // 22:00-2:00 のような日跨ぎ。DB の end_at >= start_at 制約に合わせて翌日に繰り上げる。
  const endAt = new Date(endTimestamp < startTimestamp ? endTimestamp + DAY_IN_MS : endTimestamp).toISOString();

  return { startAt, endAt };
}

function readAssigneeIds(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("participant_ids")
        .map((value) => value.toString().trim())
        .filter((value) => value.length > 0)
    )
  ];
}

async function replaceAssignees(supabase: SupabaseClient, itemId: string, participantIds: string[]) {
  if (participantIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("plan_timetable_item_assignees")
    .insert(participantIds.map((participantId) => ({ item_id: itemId, participant_id: participantId })));

  if (error) {
    throw new Error(error.message);
  }
}

async function clearAssignees(supabase: SupabaseClient, itemId: string) {
  const { error } = await supabase.from("plan_timetable_item_assignees").delete().eq("item_id", itemId);

  if (error) {
    throw new Error(error.message);
  }
}

function revalidateTimetable(planId: string) {
  revalidatePath(`/plans/${planId}/timetable`);
}

export async function createPlanTimetableItemAction(planId: string, formData: FormData) {
  const { supabase, user, plan } = await requireTimetableEditor(planId);

  if (!plan.confirmed_start_at) {
    throw new Error("開催日時が決まっていないため、進行表を追加できません。");
  }

  const title = readTitle(formData);
  const note = readNote(formData);
  const { startAt, endAt } = readSchedule(formData, toJstDateKey(plan.confirmed_start_at));

  const { data: created, error } = await supabase
    .from("plan_timetable_items")
    .insert({
      plan_id: planId,
      start_at: startAt,
      end_at: endAt,
      title,
      note,
      created_by_user_id: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await replaceAssignees(supabase, created.id, readAssigneeIds(formData));
  revalidateTimetable(planId);
}

export async function updatePlanTimetableItemAction(planId: string, itemId: string, formData: FormData) {
  const { supabase, plan } = await requireTimetableEditor(planId);

  if (!plan.confirmed_start_at) {
    throw new Error("開催日時が決まっていないため、進行表を編集できません。");
  }

  const title = readTitle(formData);
  const note = readNote(formData);
  const { startAt, endAt } = readSchedule(formData, toJstDateKey(plan.confirmed_start_at));

  const { error } = await supabase
    .from("plan_timetable_items")
    .update({ start_at: startAt, end_at: endAt, title, note })
    .eq("id", itemId)
    .eq("plan_id", planId);

  if (error) {
    throw new Error(error.message);
  }

  // 担当は差分を取らず、いったん消してから入れ直す。組み合わせが変わるだけなので単純さを優先する。
  await clearAssignees(supabase, itemId);
  await replaceAssignees(supabase, itemId, readAssigneeIds(formData));
  revalidateTimetable(planId);
}

export async function deletePlanTimetableItemAction(planId: string, itemId: string) {
  const { supabase } = await requireTimetableEditor(planId);

  const { error } = await supabase
    .from("plan_timetable_items")
    .delete()
    .eq("id", itemId)
    .eq("plan_id", planId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTimetable(planId);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/actions/plan-timetable.test.ts`
Expected: PASS（13件）

- [ ] **Step 5: ミューテーション検査**

2つ試して、対応するテストが FAIL することを確認してから戻す。

1. `readSchedule` の日跨ぎ繰り上げを消して `endTimestamp` をそのまま使う →「終了時刻が開始より前なら翌日として保存する」が落ちること
2. `requireTimetableEditor` の `plan.status !== "date_confirmed"` ガードを消す →「日程が確定していない日程調整には追加できない」が落ちること

- [ ] **Step 6: コミット**

```bash
git add lib/actions/plan-timetable.ts tests/actions/plan-timetable.test.ts
git commit -m "feat: add plan timetable server actions"
```

---

### Task 6: 追加・編集フォーム UI

**Files:**
- Create: `components/details-scroll-into-view.tsx`
- Create: `components/participant-toggle-chips.tsx`
- Create: `components/plan-timetable-form.tsx`
- Test: `tests/plan-timetable.test.tsx`

**Interfaces:**
- Consumes: `TimetableAssignee`（Task 2）、Task 5 のフィールド名（`date` / `start_time` / `end_time` / `title` / `note` / `participant_ids`）
- Produces:
  - `<DetailsScrollIntoView />`
  - `<ParticipantToggleChips participants={TimetableParticipantOption[]} defaultSelectedIds={string[]} />`
  - `type TimetableParticipantOption = { participantId: string; displayName: string; status: string }`
  - `<PlanTimetableForm ... />` — props は下の実装を参照

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan-timetable.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ParticipantToggleChips } from "@/components/participant-toggle-chips";
import { PlanTimetableForm } from "@/components/plan-timetable-form";

const participants = [
  { participantId: "p1", displayName: "あかり", status: "confirmed" },
  { participantId: "p2", displayName: "ゆうき", status: "confirmed" },
  { participantId: "p3", displayName: "そら", status: "declined" }
];

describe("ParticipantToggleChips", () => {
  it("辞退した参加者は候補に出さない", () => {
    render(<ParticipantToggleChips participants={participants} />);

    expect(screen.getByRole("button", { name: "あかり" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "そら" })).not.toBeInTheDocument();
  });

  it("すでに担当になっている辞退者は候補に残し、辞退と分かるようにする", () => {
    render(<ParticipantToggleChips participants={participants} defaultSelectedIds={["p3"]} />);

    const chip = screen.getByRole("button", { name: /そら/ });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("辞退");
  });

  it("押すと hidden input が増え、もう一度押すと消える", async () => {
    const user = userEvent.setup();
    const { container } = render(<ParticipantToggleChips participants={participants} />);

    await user.click(screen.getByRole("button", { name: "あかり" }));
    expect(container.querySelectorAll('input[name="participant_ids"]')).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "あかり" }));
    expect(container.querySelectorAll('input[name="participant_ids"]')).toHaveLength(0);
  });

  it("全員チップで参加中の全員を選ぶ", async () => {
    const user = userEvent.setup();
    const { container } = render(<ParticipantToggleChips participants={participants} />);

    await user.click(screen.getByRole("button", { name: "全員" }));

    const values = [...container.querySelectorAll('input[name="participant_ids"]')].map(
      (input) => (input as HTMLInputElement).value
    );
    expect(values.sort()).toEqual(["p1", "p2"]);
  });

  it("選択中のチップは aria-pressed で分かる", async () => {
    const user = userEvent.setup();
    render(<ParticipantToggleChips participants={participants} />);

    const chip = screen.getByRole("button", { name: "あかり" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PlanTimetableForm", () => {
  const baseProps = {
    action: vi.fn(),
    participants,
    eventDates: ["2026-08-15"],
    defaultDate: "2026-08-15",
    defaultStartTime: "13:00"
  };

  it("入口は閉じた状態の折りたたみ行にする", () => {
    render(<PlanTimetableForm {...baseProps} />);

    const details = screen.getByText("＋ 進行を追加").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });

  it("単日イベントでは日付欄を出さない", () => {
    render(<PlanTimetableForm {...baseProps} />);

    expect(screen.queryByLabelText("日付")).not.toBeInTheDocument();
  });

  it("複数日イベントでは日付欄を出す", () => {
    render(<PlanTimetableForm {...baseProps} eventDates={["2026-08-15", "2026-08-16"]} />);

    expect(screen.getByLabelText("日付")).toBeInTheDocument();
  });

  it("時刻はネイティブの time 入力にする", () => {
    render(<PlanTimetableForm {...baseProps} />);

    expect(screen.getByLabelText("開始")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("終了（任意）")).toHaveAttribute("type", "time");
  });

  it("開始時刻には最後の行の1時間後が入っている", () => {
    render(<PlanTimetableForm {...baseProps} defaultStartTime="15:30" />);

    expect(screen.getByLabelText("開始")).toHaveValue("15:30");
  });

  it("同じページに複数置いても入力の id が衝突しない", () => {
    const { container } = render(
      <div>
        <PlanTimetableForm {...baseProps} />
        <PlanTimetableForm {...baseProps} idPrefix="timetable-edit-a" summaryLabel="編集" submitLabel="保存" />
      </div>
    );

    const ids = [...container.querySelectorAll('input[name="start_time"]')].map((input) => input.id);
    expect(new Set(ids).size).toBe(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: FAIL（`Failed to resolve import "@/components/participant-toggle-chips"`）

- [ ] **Step 3: `DetailsScrollIntoView` を書く**

`components/details-scroll-into-view.tsx`:

```tsx
"use client";

import React, { useEffect, useRef } from "react";

/**
 * 親の <details> が開いたら、フォームを画面中央へ寄せる。
 *
 * iOS はキーボードを画面に重ね、Android はレイアウトをリサイズするため、
 * 放っておくと開いた入力欄がキーボードに隠れる。
 * <details> の開閉自体は JS ゼロのままにしたいので、この部品だけを中に置く。
 */
export function DetailsScrollIntoView() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const details = anchorRef.current?.closest("details");
    if (!details) {
      return;
    }

    const handleToggle = () => {
      if (!details.open) {
        return;
      }

      details.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    details.addEventListener("toggle", handleToggle);
    return () => details.removeEventListener("toggle", handleToggle);
  }, []);

  return <span ref={anchorRef} aria-hidden="true" className="hidden" />;
}
```

- [ ] **Step 4: `ParticipantToggleChips` を書く**

`components/participant-toggle-chips.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { clsx } from "clsx";

export type TimetableParticipantOption = {
  participantId: string;
  displayName: string;
  status: string;
};

/** 辞退・キャンセルの人は新しい担当の候補から外す。 */
const inactiveStatuses = new Set(["declined", "cancelled"]);

export function ParticipantToggleChips({
  participants,
  defaultSelectedIds = [],
  label = "担当"
}: {
  participants: TimetableParticipantOption[];
  defaultSelectedIds?: string[];
  label?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);

  // 辞退した人でも、すでに担当になっているなら勝手に外さない。外れるほうが事故になる。
  const options = participants.filter(
    (participant) => !inactiveStatuses.has(participant.status) || selected.includes(participant.participantId)
  );
  const activeIds = participants
    .filter((participant) => !inactiveStatuses.has(participant.status))
    .map((participant) => participant.participantId);

  const toggle = (participantId: string) => {
    setSelected((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId]
    );
  };

  return (
    <div>
      <span className="text-caption text-muted">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(activeIds)}
          className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
        >
          全員
        </button>

        {options.map((participant) => {
          const isSelected = selected.includes(participant.participantId);
          const isInactive = inactiveStatuses.has(participant.status);

          return (
            <button
              key={participant.participantId}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(participant.participantId)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                isSelected
                  ? "border-moss bg-mist/45 text-pine"
                  : "border-line bg-surface text-muted hover:border-moss hover:text-pine"
              )}
            >
              <span className={isInactive ? "line-through" : undefined}>{participant.displayName}</span>
              {isInactive ? <span className="ml-1 font-normal text-subtle">辞退</span> : null}
            </button>
          );
        })}
      </div>

      {selected.map((participantId) => (
        <input key={participantId} type="hidden" name="participant_ids" value={participantId} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `PlanTimetableForm` を書く**

`components/plan-timetable-form.tsx`:

```tsx
import React from "react";

import { DetailsScrollIntoView } from "@/components/details-scroll-into-view";
import {
  ParticipantToggleChips,
  type TimetableParticipantOption
} from "@/components/participant-toggle-chips";

const inputClass =
  "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20";

/**
 * 進行表の追加・編集フォーム。
 * 入口は閉じた <details>。繰り返し足す軽いものなので、専用ページには飛ばさずその場で開く。
 */
export function PlanTimetableForm({
  action,
  participants,
  eventDates,
  defaultDate,
  defaultStartTime,
  summaryLabel = "＋ 進行を追加",
  submitLabel = "追加",
  defaultValues,
  idPrefix = "timetable-new"
}: {
  action: (formData: FormData) => void | Promise<void>;
  participants: TimetableParticipantOption[];
  /** 開催が何日にまたがるか。1日なら日付欄を出さない。 */
  eventDates: string[];
  defaultDate: string;
  defaultStartTime: string;
  summaryLabel?: string;
  submitLabel?: string;
  defaultValues?: {
    title?: string;
    note?: string | null;
    endTime?: string;
    assigneeIds?: string[];
  };
  /** 1ページに複数のフォームが並ぶので、label の htmlFor が衝突しないよう id を分ける。 */
  idPrefix?: string;
}) {
  const isMultiDay = eventDates.length > 1;

  return (
    <details className="rounded-control border border-line bg-surface">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-body font-bold text-pine">
        {summaryLabel}
      </summary>

      <DetailsScrollIntoView />

      <form action={action} className="space-y-4 border-t border-line px-4 py-4">
        {isMultiDay ? (
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-date`}>
              日付
            </label>
            <select id={`${idPrefix}-date`} name="date" defaultValue={defaultDate} className={inputClass}>
              {eventDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-start-time`}>
              開始
            </label>
            <input
              id={`${idPrefix}-start-time`}
              name="start_time"
              type="time"
              required
              defaultValue={defaultStartTime}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-caption text-muted" htmlFor={`${idPrefix}-end-time`}>
              終了（任意）
            </label>
            <input
              id={`${idPrefix}-end-time`}
              name="end_time"
              type="time"
              defaultValue={defaultValues?.endTime ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="text-caption text-muted" htmlFor={`${idPrefix}-title`}>
            進行の名前
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            type="text"
            required
            maxLength={100}
            defaultValue={defaultValues?.title ?? ""}
            placeholder="例: 海の家で集合"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-caption text-muted" htmlFor={`${idPrefix}-note`}>
            メモ（任意）
          </label>
          <textarea
            id={`${idPrefix}-note`}
            name="note"
            maxLength={500}
            rows={2}
            defaultValue={defaultValues?.note ?? ""}
            placeholder="例: 日焼け止めを塗ってから"
            className={`${inputClass} min-h-20`}
          />
        </div>

        <ParticipantToggleChips participants={participants} defaultSelectedIds={defaultValues?.assigneeIds} />

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </details>
  );
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: PASS（12件）

- [ ] **Step 7: ミューテーション検査**

2つ試して、対応するテストが FAIL することを確認してから戻す。

1. `ParticipantToggleChips` の `options` フィルタから `|| selected.includes(participant.participantId)` を消す →「すでに担当になっている辞退者は候補に残し〜」が落ちること
2. `id={`${idPrefix}-start-time`}` を `id="timetable-start-time"` に戻す →「同じページに複数置いても入力の id が衝突しない」が落ちること

- [ ] **Step 8: コミット**

```bash
git add components/details-scroll-into-view.tsx components/participant-toggle-chips.tsx components/plan-timetable-form.tsx tests/plan-timetable.test.tsx
git commit -m "feat: add timetable form with participant toggle chips"
```

---

### Task 7: 進行表の一覧 UI

**Files:**
- Create: `components/plan-timetable.tsx`
- Modify: `lib/format.ts`（`formatJstTime` を追加）
- Test: `tests/plan-timetable.test.tsx`（追記）
- Test: `tests/format.test.ts`（追記）

**Interfaces:**
- Consumes: Task 2〜4 のドメイン関数と型
- Produces:
  - `formatJstTime(value: string | null | undefined): string`（`lib/format.ts`）
  - `<PlanTimetable items={TimetableItem[]} now={Date} canEdit={boolean} deleteAction={(itemId: string) => (formData: FormData) => void | Promise<void>} />`

- [ ] **Step 1: `formatJstTime` の失敗するテストを書く**

`tests/format.test.ts` に追記（import に `formatJstTime` を足す）:

```ts
describe("formatJstTime", () => {
  it("実行環境のTZに関係なくJSTの時刻を返す", () => {
    // 2026-08-15T04:00Z は JST 13:00。UTC 環境で動かしても 13:00 にならなければならない。
    expect(formatJstTime("2026-08-15T04:00:00+00:00")).toBe("13:00");
  });

  it("日をまたぐ時刻も JST で返す", () => {
    // 2026-08-15T17:00Z = JST 翌 02:00。
    expect(formatJstTime("2026-08-15T17:00:00+00:00")).toBe("02:00");
  });

  it("未設定は未設定と出す", () => {
    expect(formatJstTime(null)).toBe("未設定");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `TZ=UTC npx vitest run tests/format.test.ts`
Expected: FAIL（`formatJstTime is not a function`）

- [ ] **Step 3: `formatJstTime` を実装する**

`lib/format.ts` に追記する。**既存の `formatTime` は他ページが依存しているので触らない。**

```ts
/**
 * JST 固定の時刻表示。
 *
 * 既存の formatTime は timeZone を指定しておらず実行環境の TZ に従うため、
 * TZ が UTC の本番（Vercel の Node.js ランタイム）では9時間ずれる。
 * 進行表は時刻そのものが中身なので、こちらを使う。
 */
const jstTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatJstTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return jstTimeFormatter.format(new Date(value));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `TZ=UTC npx vitest run tests/format.test.ts`
Expected: PASS

- [ ] **Step 5: 一覧の失敗するテストを書く**

`tests/plan-timetable.test.tsx` に追記（import に `PlanTimetable` と `TimetableItem` を追加）:

```tsx
import { PlanTimetable } from "@/components/plan-timetable";
import type { TimetableItem } from "@/lib/domain/plan-timetable";

function timetableItem(
  overrides: Partial<TimetableItem> & Pick<TimetableItem, "id" | "startAt" | "title">
): TimetableItem {
  return {
    endAt: null,
    note: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    assignees: [],
    ...overrides
  };
}

describe("PlanTimetable", () => {
  const noopDelete = () => () => {};

  it("何も無いときは空の案内を出す", () => {
    render(<PlanTimetable items={[]} now={new Date("2026-08-15T12:00:00+09:00")} canEdit deleteAction={noopDelete} />);

    expect(screen.getByText(/まだ進行表はありません/)).toBeInTheDocument();
  });

  it("単日なら日付見出しを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.queryByTestId("timetable-date-heading")).not.toBeInTheDocument();
  });

  it("複数日なら日付見出しを出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" }),
          timetableItem({ id: "b", startAt: "2026-08-16T09:00:00+09:00", title: "朝食" })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getAllByTestId("timetable-date-heading")).toHaveLength(2);
  });

  it("進行中の行にいまここを出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ"
          })
        ]}
        now={new Date("2026-08-15T14:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("▶ いまここ")).toBeInTheDocument();
  });

  it("分岐は分かれ目と合流の見出しで挟む", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "sea",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ",
            createdAt: "2026-08-01T00:00:00+09:00"
          }),
          timetableItem({
            id: "cafe",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T16:00:00+09:00",
            title: "カフェで休む",
            createdAt: "2026-08-01T00:01:00+09:00"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText(/二手に分かれる/)).toBeInTheDocument();
    expect(screen.getByText(/合流/)).toBeInTheDocument();
  });

  it("レーンが3つ以上なら横並びをやめて縦に積む", () => {
    const lanes = ["a", "b", "c"].map((id, index) =>
      timetableItem({
        id,
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        title: `班${id}`,
        createdAt: `2026-08-01T00:0${index}:00+09:00`,
        assignees: [{ participantId: `p${index}`, displayName: `担当${index}`, status: "confirmed" }]
      })
    );

    const { container } = render(
      <PlanTimetable items={lanes} now={new Date("2026-08-15T12:00:00+09:00")} canEdit={false} deleteAction={noopDelete} />
    );

    // jsdom は computed style を持たないのでクラス名で確認する（プロジェクトの作法）。
    const laneContainer = container.querySelector('[data-testid="timetable-lanes"]');
    expect(laneContainer?.className).toContain("grid-cols-1");
    expect(laneContainer?.className).not.toContain("sm:grid-cols-2");
  });

  it("2レーンなら横に並べる", () => {
    const lanes = ["a", "b"].map((id, index) =>
      timetableItem({
        id,
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        title: `班${id}`,
        createdAt: `2026-08-01T00:0${index}:00+09:00`,
        assignees: [{ participantId: `p${index}`, displayName: `担当${index}`, status: "confirmed" }]
      })
    );

    const { container } = render(
      <PlanTimetable items={lanes} now={new Date("2026-08-15T12:00:00+09:00")} canEdit={false} deleteAction={noopDelete} />
    );

    expect(container.querySelector('[data-testid="timetable-lanes"]')?.className).toContain("sm:grid-cols-2");
  });

  it("所要時間を出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T14:30:00+09:00",
            title: "海で泳ぐ"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("1時間30分")).toBeInTheDocument();
  });

  it("辞退した担当は取り消し線と辞退バッジで残す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            title: "受付",
            assignees: [{ participantId: "p3", displayName: "そら", status: "declined" }]
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("そら").className).toContain("line-through");
    expect(screen.getByText("辞退")).toBeInTheDocument();
  });

  it("編集できないときは削除ボタンを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.queryByRole("button", { name: "集合を削除" })).not.toBeInTheDocument();
  });

  it("編集できるときは削除ボタンを出す", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByRole("button", { name: "集合を削除" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: FAIL（`Failed to resolve import "@/components/plan-timetable"`）

- [ ] **Step 7: 実装する**

`components/plan-timetable.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import React from "react";

import { EmptyState } from "@/components/ui";
import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  resolveCurrentTimetableItemIds,
  resolveTimetableDurations,
  type TimetableAssignee,
  type TimetableBlock,
  type TimetableItem
} from "@/lib/domain/plan-timetable";
import { formatDate, formatJstTime } from "@/lib/format";

type DeleteAction = (itemId: string) => (formData: FormData) => void | Promise<void>;

const inactiveStatuses = new Set(["declined", "cancelled"]);

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2";

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest}分`;
  }
  if (rest === 0) {
    return `${hours}時間`;
  }

  return `${hours}時間${rest}分`;
}

function AssigneeChips({ assignees }: { assignees: TimetableAssignee[] }) {
  if (assignees.length === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {assignees.map((assignee) => {
        const isInactive = inactiveStatuses.has(assignee.status);

        return (
          <span
            key={assignee.participantId}
            className="rounded-full border border-line bg-sunken px-2 py-0.5 text-xs text-muted"
          >
            <span className={isInactive ? "line-through" : undefined}>{assignee.displayName}</span>
            {isInactive ? <span className="ml-1 text-subtle">辞退</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function TimetableRow({
  item,
  durationMinutes,
  isCurrent,
  canEdit,
  deleteAction
}: {
  item: TimetableItem;
  durationMinutes: number | undefined;
  isCurrent: boolean;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  return (
    <div
      data-testid={`timetable-item-${item.id}`}
      className={`flex flex-col gap-2 rounded-control border p-3 sm:flex-row sm:items-start sm:gap-3 ${
        isCurrent ? "border-moss bg-mist/45" : "border-line bg-surface"
      }`}
    >
      <div className="shrink-0 text-body font-bold text-ink sm:w-24">
        {formatJstTime(item.startAt)}
        {item.endAt ? <span className="text-caption font-normal text-muted"> - {formatJstTime(item.endAt)}</span> : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-body font-medium text-ink">{item.title}</span>
          {isCurrent ? <span className="text-caption font-bold text-pine">▶ いまここ</span> : null}
        </div>

        {item.note ? <p className="break-words text-caption text-muted">{item.note}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {durationMinutes === undefined ? null : (
            <span className="text-caption text-subtle">{formatDuration(durationMinutes)}</span>
          )}
          <AssigneeChips assignees={item.assignees} />
        </div>
      </div>

      {canEdit ? (
        <form action={deleteAction(item.id)}>
          <button type="submit" className={iconButtonClass} aria-label={`${item.title}を削除`}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
      ) : null}
    </div>
  );
}

function TimetableBlockView({
  block,
  durations,
  current,
  canEdit,
  deleteAction
}: {
  block: TimetableBlock;
  durations: Record<string, number>;
  current: Set<string>;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  if (block.kind === "single") {
    return (
      <TimetableRow
        item={block.item}
        durationMinutes={durations[block.item.id]}
        isCurrent={current.has(block.item.id)}
        canEdit={canEdit}
        deleteAction={deleteAction}
      />
    );
  }

  // 375px で3列に割ると1列が100pxを切って読めなくなるので、3レーン以上は縦に積む。
  const laneColumnClass = block.lanes.length >= 3 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="rounded-control border border-line-strong bg-sunken p-3">
      <p className="text-caption font-bold text-pine">⑂ {formatJstTime(block.startAt)} から 二手に分かれる</p>

      <div data-testid="timetable-lanes" className={`mt-3 grid gap-3 ${laneColumnClass}`}>
        {block.lanes.map((lane) => (
          <div key={lane.key} className="space-y-2">
            {lane.assignees.length > 0 ? <AssigneeChips assignees={lane.assignees} /> : null}
            {lane.items.map((item) => (
              <TimetableRow
                key={item.id}
                item={item}
                durationMinutes={durations[item.id]}
                isCurrent={current.has(item.id)}
                canEdit={canEdit}
                deleteAction={deleteAction}
              />
            ))}
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption font-bold text-pine">⑃ {formatJstTime(block.endAt)} に合流</p>
    </div>
  );
}

export function PlanTimetable({
  items,
  now,
  canEdit,
  deleteAction
}: {
  items: TimetableItem[];
  now: Date;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  if (items.length === 0) {
    return <EmptyState>まだ進行表はありません。集合・移動・解散の時刻を書いておくと、当日に迷いません。</EmptyState>;
  }

  const groups = groupTimetableItemsByDate(items);
  const durations = resolveTimetableDurations(items);
  const current = resolveCurrentTimetableItemIds(items, now);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.dateKey} className="space-y-2">
          {groups.length > 1 ? (
            <h3 data-testid="timetable-date-heading" className="text-title text-ink">
              {formatDate(group.dateKey)}
            </h3>
          ) : null}

          {buildTimetableBlocks(group.items).map((block) => (
            <TimetableBlockView
              key={block.kind === "single" ? block.item.id : `branch-${block.startAt}`}
              block={block}
              durations={durations}
              current={current}
              canEdit={canEdit}
              deleteAction={deleteAction}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: テストが通ることを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: PASS（22件）

- [ ] **Step 9: ミューテーション検査**

`block.lanes.length >= 3` を `>= 4` に変えて「レーンが3つ以上なら横並びをやめて縦に積む」が FAIL することを確認してから戻す。
`groups.length > 1` を `groups.length > 0` に変えて「単日なら日付見出しを出さない」が FAIL することも確認する。
`formatJstTime` の `timeZone: "Asia/Tokyo"` を消し、`TZ=UTC npx vitest run tests/format.test.ts` で
「実行環境のTZに関係なくJSTの時刻を返す」が FAIL することを確認してから戻す。

- [ ] **Step 10: コミット**

```bash
git add lib/format.ts components/plan-timetable.tsx tests/format.test.ts tests/plan-timetable.test.tsx
git commit -m "feat: render plan timetable with branches and current marker"
```

---

### Task 8: ページ・スケルトン・plan 詳細からの導線

**Files:**
- Create: `app/plans/[planId]/timetable/page.tsx`
- Create: `app/plans/[planId]/timetable/loading.tsx`
- Modify: `app/plans/[planId]/page.tsx`（`isConfirmed` のときリンクを追加）
- Test: `tests/route-loading-skeletons.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 2〜7 のすべて
- Produces: ルート `/plans/[planId]/timetable`

- [ ] **Step 1: 失敗するテストを書く**

`tests/route-loading-skeletons.test.tsx` を3か所直す。

import に追加:

```tsx
import TimetableLoading from "@/app/plans/[planId]/timetable/loading";
```

1つ目の `it.each` に追加:

```tsx
    ["清算", SettlementLoading],
    ["進行表", TimetableLoading]
```

2つ目の `it.each` に追加:

```tsx
    ["清算", SettlementLoading, 10, 3],
    // 進行表は見出し1枠と行のリスト。清算ほど枠は多くない。
    ["進行表", TimetableLoading, 6, 2]
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/route-loading-skeletons.test.tsx`
Expected: FAIL（`Failed to resolve import "@/app/plans/[planId]/timetable/loading"`）

- [ ] **Step 3: `loading.tsx` を書く**

`app/plans/[planId]/timetable/loading.tsx`:

```tsx
import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div role="status" aria-label="読み込み中" className="space-y-6">
      <Skeleton className="h-28 w-full" />
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-11 w-full" />
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/route-loading-skeletons.test.tsx`
Expected: PASS

- [ ] **Step 5: ページを書く**

`app/plans/[planId]/timetable/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import React from "react";

import { PlanTimetable } from "@/components/plan-timetable";
import { PlanTimetableForm } from "@/components/plan-timetable-form";
import { Alert, Card, PageHeader, SecondaryLink } from "@/components/ui";
import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction
} from "@/lib/actions/plan-timetable";
import {
  sortTimetableItems,
  toJstDateKey,
  type TimetableItem
} from "@/lib/domain/plan-timetable";
import { formatDateTimeRange, formatJstTime } from "@/lib/format";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
  user_id: string | null;
};

type AssigneeRow = {
  participant_id: string;
};

type TimetableItemRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  title: string;
  note: string | null;
  created_at: string;
  plan_timetable_item_assignees: AssigneeRow[] | null;
};

/** 開催期間にまたがる日付を JST で列挙する。日付欄を出すかどうかの判断に使う。 */
function listEventDates(startAt: string | null, endAt: string | null): string[] {
  if (!startAt) {
    return [];
  }

  const startKey = toJstDateKey(startAt);
  const endKey = endAt ? toJstDateKey(endAt) : startKey;
  const dates: string[] = [];
  const cursor = new Date(`${startKey}T00:00:00+09:00`);
  const last = new Date(`${endKey}T00:00:00+09:00`);

  while (cursor.getTime() <= last.getTime()) {
    dates.push(toJstDateKey(cursor.toISOString()));
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

/**
 * 追加フォームの初期時刻。最後の行の1時間後、無ければ開催時刻。
 * formatJstTime は「HH:MM」を返すので <input type="time"> にそのまま入る。
 */
function defaultStartTimeOf(items: TimetableItem[], confirmedStartAt: string | null): string {
  const last = items[items.length - 1];

  if (last) {
    return formatJstTime(new Date(new Date(last.startAt).getTime() + 60 * 60 * 1000).toISOString());
  }

  return confirmedStartAt ? formatJstTime(confirmedStartAt) : "10:00";
}

export default async function PlanTimetablePage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select(
      "id, title, status, owner_user_id, confirmed_start_at, confirmed_end_at, events(id, title), participants(id, display_name, status, user_id)"
    )
    .eq("id", planId)
    .single();

  // クエリ自体の失敗を404にしない。列の欠落やスキーマ不整合が
  // 「ページが見つかりません」として出ると原因を追えなくなる。
  if (planError && planError.code !== "PGRST116") {
    throw new Error(`進行表のデータ取得に失敗しました: ${planError.message}`);
  }
  if (!plan) {
    notFound();
  }

  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  const isOwner = plan.owner_user_id === userId;
  const canView = isOwner || participants.some((participant) => participant.user_id === userId);
  if (!canView) {
    notFound();
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("plan_timetable_items")
    .select("id, start_at, end_at, title, note, created_at, plan_timetable_item_assignees(participant_id)")
    .eq("plan_id", planId);

  if (itemsError) {
    throw new Error(`進行表の取得に失敗しました: ${itemsError.message}`);
  }

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const items = sortTimetableItems(
    ((itemRows ?? []) as TimetableItemRow[]).map((row) => ({
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      title: row.title,
      note: row.note,
      createdAt: row.created_at,
      assignees: (row.plan_timetable_item_assignees ?? [])
        .map((assignee) => participantById.get(assignee.participant_id))
        .filter((participant): participant is ParticipantRow => Boolean(participant))
        .map((participant) => ({
          participantId: participant.id,
          displayName: participant.display_name,
          status: participant.status
        }))
    }))
  );

  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const isConfirmed = plan.status === "date_confirmed";
  const eventDates = listEventDates(plan.confirmed_start_at, plan.confirmed_end_at);
  const createItem = createPlanTimetableItemAction.bind(null, plan.id);
  const deleteItem = (itemId: string) => deletePlanTimetableItemAction.bind(null, plan.id, itemId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Timetable"
        title="当日の進行表"
        description={[event?.title?.trim(), plan.title?.trim()].filter(Boolean).join(" / ") || "当日の流れを時刻で共有します。"}
        action={<SecondaryLink href={`/plans/${plan.id}`}>日程調整へ戻る</SecondaryLink>}
      />

      {plan.confirmed_start_at ? (
        <Card className="p-4">
          <p className="text-caption text-muted">開催日時</p>
          <p className="mt-1 text-body font-bold text-ink">
            {formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at)}
          </p>
        </Card>
      ) : null}

      {isConfirmed ? null : (
        <Alert tone="warn">日程がまだ確定していないため、進行表は閲覧のみです。</Alert>
      )}

      <Card className="space-y-4">
        <PlanTimetable items={items} now={new Date()} canEdit={isConfirmed} deleteAction={deleteItem} />

        {isConfirmed ? (
          <PlanTimetableForm
            action={createItem}
            participants={participants.map((participant) => ({
              participantId: participant.id,
              displayName: participant.display_name,
              status: participant.status
            }))}
            eventDates={eventDates}
            defaultDate={eventDates[0] ?? toJstDateKey(new Date().toISOString())}
            defaultStartTime={defaultStartTimeOf(items, plan.confirmed_start_at)}
          />
        ) : null}
      </Card>
    </div>
  );
}
```

`Alert` の `tone` は `info` / `warn` / `error` の3値（`components/ui-server.tsx:212`）。ここでは `warn` を使う。

- [ ] **Step 6: plan 詳細に導線を足す**

`app/plans/[planId]/page.tsx` の `PageHeader` の `action`（222行目付近）を次のように変える:

```tsx
            {!isConfirmed && candidateSummaries.length > 0 ? <ButtonLink href={`/plans/${plan.id}/confirm`}>日程を確定</ButtonLink> : null}
            {isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/timetable`}>当日の進行表へ</SecondaryLink> : null}
            {isConfirmed ? <SecondaryLink href={`/plans/${plan.id}/settlement`}>支払い・清算へ</SecondaryLink> : null}
```

- [ ] **Step 7: 全体を通す**

```bash
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
```

Expected: すべて成功。テスト数は 803 + 今回追加分。

- [ ] **Step 8: コミット**

```bash
git add app/plans/[planId]/timetable app/plans/[planId]/page.tsx tests/route-loading-skeletons.test.tsx
git commit -m "feat: add plan timetable page and entry point"
```

---

### Task 9: 行の編集

Task 5 で `updatePlanTimetableItemAction` を作ったが、ここまでのタスクには編集の入口が無い。
設計docのスコープは「作成・編集・削除」なので、行ごとの折りたたみ編集フォームを足す。

**Files:**
- Modify: `components/plan-timetable.tsx`（`editAction` と編集フォームを追加）
- Modify: `app/plans/[planId]/timetable/page.tsx`（`editAction` を渡す）
- Test: `tests/plan-timetable.test.tsx`（追記）

**Interfaces:**
- Consumes: Task 5 の `updatePlanTimetableItemAction`、Task 6 の `PlanTimetableForm`（`idPrefix` / `summaryLabel` / `submitLabel` / `defaultValues`）
- Produces: `<PlanTimetable>` に props 追加
  - `editAction?: (itemId: string) => (formData: FormData) => void | Promise<void>`
  - `participants?: TimetableParticipantOption[]`
  - `eventDates?: string[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan-timetable.test.tsx` の `describe("PlanTimetable")` に追記:

```tsx
  const editProps = {
    editAction: () => () => {},
    participants,
    eventDates: ["2026-08-15"]
  };

  it("編集できるときは行ごとに編集の折りたたみを出す", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByText("編集")).toBeInTheDocument();
  });

  it("編集できないときは編集の折りたたみを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
  });

  it("編集フォームには元の値が入っている", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T14:30:00+09:00",
            title: "海で泳ぐ",
            note: "日焼け止め",
            assignees: [{ participantId: "p1", displayName: "あかり", status: "confirmed" }]
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByLabelText("開始")).toHaveValue("13:00");
    expect(screen.getByLabelText("終了（任意）")).toHaveValue("14:30");
    expect(screen.getByLabelText("進行の名前")).toHaveValue("海で泳ぐ");
    expect(screen.getByLabelText("メモ（任意）")).toHaveValue("日焼け止め");
    // 担当は選択済みとしてチップが押された状態になっている。
    expect(screen.getByRole("button", { name: "あかり" })).toHaveAttribute("aria-pressed", "true");
  });

  it("行が2つあっても入力の id が衝突しない", () => {
    const { container } = render(
      <PlanTimetable
        items={[
          timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" }),
          timetableItem({ id: "b", startAt: "2026-08-15T14:00:00+09:00", title: "移動" })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    const ids = [...container.querySelectorAll('input[name="start_time"]')].map((input) => input.id);
    expect(new Set(ids).size).toBe(2);
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: FAIL（「編集できるときは行ごとに編集の折りたたみを出す」で `Unable to find an element with the text: 編集`）

- [ ] **Step 3: `PlanTimetable` に編集を足す**

`components/plan-timetable.tsx` を4か所直す。

1つ目 — import を追加:

```tsx
import { PlanTimetableForm } from "@/components/plan-timetable-form";
import type { TimetableParticipantOption } from "@/components/participant-toggle-chips";
```

2つ目 — 型を追加:

```tsx
type EditAction = (itemId: string) => (formData: FormData) => void | Promise<void>;

type EditSupport = {
  editAction?: EditAction;
  participants?: TimetableParticipantOption[];
  eventDates?: string[];
};
```

3つ目 — `TimetableRow` に編集フォームを足す。props に `EditSupport` を混ぜ、削除ボタンの `</form>` の直後（`)}` の後、外側 `</div>` の前）にフォームを置く:

```tsx
function TimetableRow({
  item,
  durationMinutes,
  isCurrent,
  canEdit,
  deleteAction,
  editAction,
  participants,
  eventDates
}: {
  item: TimetableItem;
  durationMinutes: number | undefined;
  isCurrent: boolean;
  canEdit: boolean;
  deleteAction: DeleteAction;
} & EditSupport) {
```

`return` の最も外側を `<div className="space-y-2">` で包み、既存の行 `<div>` の後ろに置く:

```tsx
      {canEdit && editAction && participants ? (
        <PlanTimetableForm
          action={editAction(item.id)}
          participants={participants}
          eventDates={eventDates ?? []}
          defaultDate={toJstDateKey(item.startAt)}
          defaultStartTime={formatJstTime(item.startAt)}
          summaryLabel="編集"
          submitLabel="保存"
          idPrefix={`timetable-edit-${item.id}`}
          defaultValues={{
            title: item.title,
            note: item.note,
            endTime: item.endAt ? formatJstTime(item.endAt) : "",
            assigneeIds: item.assignees.map((assignee) => assignee.participantId)
          }}
        />
      ) : null}
```

`toJstDateKey` を `@/lib/domain/plan-timetable` の import に足す。

4つ目 — `PlanTimetable` と `TimetableBlockView` の props に `EditSupport` を足し、`TimetableRow` まで素通しする。
`PlanTimetable` のシグネチャ:

```tsx
export function PlanTimetable({
  items,
  now,
  canEdit,
  deleteAction,
  editAction,
  participants,
  eventDates
}: {
  items: TimetableItem[];
  now: Date;
  canEdit: boolean;
  deleteAction: DeleteAction;
} & EditSupport) {
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/plan-timetable.test.tsx`
Expected: PASS（26件）

- [ ] **Step 5: ページから編集アクションを渡す**

`app/plans/[planId]/timetable/page.tsx` を3か所直す。

import に追加:

```tsx
import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction,
  updatePlanTimetableItemAction
} from "@/lib/actions/plan-timetable";
```

`deleteItem` の下に追加:

```tsx
  const editItem = (itemId: string) => updatePlanTimetableItemAction.bind(null, plan.id, itemId);
  const participantOptions = participants.map((participant) => ({
    participantId: participant.id,
    displayName: participant.display_name,
    status: participant.status
  }));
```

`<PlanTimetable>` の呼び出しを差し替え、`<PlanTimetableForm>` の `participants` も使い回す:

```tsx
        <PlanTimetable
          items={items}
          now={new Date()}
          canEdit={isConfirmed}
          deleteAction={deleteItem}
          editAction={editItem}
          participants={participantOptions}
          eventDates={eventDates}
        />

        {isConfirmed ? (
          <PlanTimetableForm
            action={createItem}
            participants={participantOptions}
            eventDates={eventDates}
            defaultDate={eventDates[0] ?? toJstDateKey(new Date().toISOString())}
            defaultStartTime={defaultStartTimeOf(items, plan.confirmed_start_at)}
          />
        ) : null}
```

- [ ] **Step 6: 全体を通す**

```bash
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
```

Expected: すべて成功。

- [ ] **Step 7: ミューテーション検査**

`idPrefix={`timetable-edit-${item.id}`}` を `idPrefix="timetable-edit"` に変えて
「行が2つあっても入力の id が衝突しない」が FAIL することを確認してから戻す。

- [ ] **Step 8: コミット**

```bash
git add components/plan-timetable.tsx app/plans/[planId]/timetable/page.tsx tests/plan-timetable.test.tsx
git commit -m "feat: allow editing timetable rows in place"
```

---

## 実装後にやること

1. **マイグレーション 028 をユーザーが Supabase の SQL エディタに流す**（このプロジェクトは手動運用）。
   流したあと read-only probe で確認する:

   ```bash
   source .env.local
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/plan_timetable_items?select=id&limit=0"
   ```

   200 なら適用済み。テーブルが無ければ `PGRST205`（404）が返る。

2. `docs/current-status.md` のリリース前チェックリストに
   `- [ ] 028_plan_timetable.sql を適用済み。` を追加する。

3. **全体 diff の最終レビューを Opus で行う**。個別タスクのレビューが全部 Approved でも、
   タスク単位では見えない退行（条件を厳しくしたときの false 側、前提そのものの誤り）が残りうる。

4. 実機（375px）で確認する。
   - `<details>` を開いたときにフォームがキーボードに隠れないか（**iOS と Android の両方**）
   - 分岐ブロックが2レーンのとき横並びで読めるか
   - 担当チップの折り返し
   - 「いまここ」のハイライトが実際の時刻で正しく出るか
