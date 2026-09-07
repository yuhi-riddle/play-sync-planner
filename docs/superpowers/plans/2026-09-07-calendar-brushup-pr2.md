# カレンダー手直し（Batch A / PR-2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日程調整カレンダー（`/plans`）の手直し4点: (#3)「今日」に戻るボタン、(#5) 選択日を pine 塗り＋今日マーカー、(#6) 土日祝の背景色を全廃、(#7) 月ピッカーを 12ヶ月グリッド＋年ホイールに作り替え。

**Architecture:** 判定ロジック（今日か / 表示中が当月か / 年リスト）は `lib/domain/` の純粋関数に切り出して Vitest。見た目は `lib/shared/calendar-styles.ts` の `dayCellClass` と2つのクライアントコンポーネントに閉じる。DB・API 変更なし。

**Tech Stack:** Next.js 15 App Router / React 19 / TypeScript / Tailwind (Madoi tokens `design/tokens.css`) / Vitest + Testing Library / `Intl.DateTimeFormat` で JST 固定

## Global Constraints

- 設計: `docs/superpowers/specs/2026-08-31-home-calendar-list-brushup-design.md`（#3/#5/#6/#7 の節。#1/#2 は PR #38-42 でマージ済み）
- Madoi トークン: `design/tokens.css`。selected/primary の pine は `from-pine to-pine-deep` グラデ（`HomeSelectedDateAgenda` と統一。他アプリ箇所と色を揃える方針が既にある）
- 日付は JST 固定。「今日」は `toJstDateKey(new Date())`（`lib/shared/jst.ts`）。Vercel は UTC なのでローカルゲッター禁止
- 升目そのものの座標日付は `toDateKey`（`lib/domain/plan/adjustment-calendar.ts`）、絶対時刻がどの日かは `toJstDateKey`。混同しない
- Vitest は `npx vitest run --reporter=dot`
- `.tsx` は `import React from "react";` 明示。UI プリミティブは `@/components/ui` から
- 祝日判定は `isJapaneseHoliday`（`lib/domain/calendar/japanese-holidays`）をそのまま使う
- 年ホイールは `prefers-reduced-motion: reduce` でスムーススクロールを無効化
- 年の範囲は **当年 −3 〜 +3**（grill Q2）
- 見た目の変更（#5/#6/#7）は実ブラウザ（`npm run dev`）で 375px とデスクトップ幅を目視確認してから完了（Task 5）
- 既存テストを壊さない。壊れたら原因を直す（スキップ・削除しない）
- コミットは各タスク末尾。論理単位

---

## ファイル構成

| ファイル | 役割 | 新規/変更 |
|---|---|---|
| `lib/domain/plan/adjustment-calendar.ts` | `CalendarDay` に `isToday`、`buildAdjustmentCalendar` が `todayDateKey` を受ける | 変更 |
| `lib/shared/calendar-styles.ts` | `dayCellClass` を作り替え（選択=pine塗り / 今日=枠 / 土日祝の背景廃止） | 変更 |
| `lib/domain/calendar/calendar-month.ts` | `isDisplayingCurrentMonth`、`pickerYearRange` を追加 | 変更 |
| `components/plan/adjustment-calendar-view.tsx` | `todayDateKey` を渡す、今日ラベルの描画、「今日」ボタン | 変更 |
| `components/plan/adjustment-month-picker.tsx` | `<input type="month">` を撤去し 12ヶ月グリッド＋年ホイールに | 書き換え |
| `tests/plan/adjustment-calendar.test.ts` | `isToday` / `todayDateKey` のテスト追加 | 変更 |
| `tests/calendar/calendar-styles.test.ts` | `dayCellClass` の新仕様に更新 | 変更 |
| `tests/calendar/calendar-month.test.ts` | 新ヘルパーのテスト追加 | 変更 |
| `tests/plan/adjustment-calendar-view.test.tsx` | 「今日」ボタン・今日ラベルの表示条件 | 変更 |
| `tests/plan/adjustment-month-picker.test.tsx` | 年ホイール・月グリッドの push URL | 新規 |

---

## Task 1: `isToday` を CalendarDay に足す（#5 の土台）

**Files:**
- Modify: `lib/domain/plan/adjustment-calendar.ts`
- Test: `tests/plan/adjustment-calendar.test.ts`

**Interfaces:**
- Produces:
  - `CalendarDay` に `isToday: boolean` を追加
  - `buildAdjustmentCalendar` の引数に `todayDateKey: string` を追加（必須）

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/adjustment-calendar.test.ts` に追記（既存の `describe("buildAdjustmentCalendar", ...)` 内）:

```ts
it("todayDateKey に一致する升目だけ isToday=true になる", () => {
  const calendar = buildAdjustmentCalendar({
    year: 2026,
    month: 7,
    selectedDateKey: "2026-07-10",
    todayDateKey: "2026-07-15",
    candidates: []
  });
  const flat = calendar.weeks.flat();
  expect(flat.filter((day) => day.isToday).map((day) => day.dateKey)).toEqual(["2026-07-15"]);
});

it("todayDateKey が表示月の外なら isToday の升目は無い", () => {
  const calendar = buildAdjustmentCalendar({
    year: 2026,
    month: 7,
    selectedDateKey: "2026-07-10",
    todayDateKey: "2026-09-01",
    candidates: []
  });
  expect(calendar.weeks.flat().some((day) => day.isToday)).toBe(false);
});

it("隣月の升目でも todayDateKey に一致すれば isToday=true", () => {
  // 2026-07 グリッドの先頭は 6/28。6/30 が「今日」なら隣月セルでも印を付ける（設計 #5/#6）。
  const calendar = buildAdjustmentCalendar({
    year: 2026,
    month: 7,
    selectedDateKey: "2026-07-10",
    todayDateKey: "2026-06-30",
    candidates: []
  });
  const today = calendar.weeks.flat().find((day) => day.isToday);
  expect(today?.dateKey).toBe("2026-06-30");
  expect(today?.isCurrentMonth).toBe(false);
});
```

既存テストで `buildAdjustmentCalendar(...)` を呼んでいる箇所は `todayDateKey` 引数が無くて型エラーになる。Step 3 で既存の呼び出しにも `todayDateKey: "2026-07-01"`（固定時刻の当日）を足す。

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/plan/adjustment-calendar.test.ts --reporter=dot`
Expected: FAIL（`todayDateKey` を渡していない／`isToday` が無い）

- [ ] **Step 3: 実装**

`lib/domain/plan/adjustment-calendar.ts`:

(a) `CalendarDay` 型に1行:

```ts
export type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  candidateCount: number;
  hasOverlap: boolean;
  hasConfirmed: boolean;
  hasCollecting: boolean;
};
```

(b) `buildAdjustmentCalendar` の引数に `todayDateKey` を足し、升目生成で使う:

```ts
export function buildAdjustmentCalendar({
  year,
  month,
  selectedDateKey,
  todayDateKey,
  candidates
}: {
  year: number;
  month: number;
  selectedDateKey: string;
  todayDateKey: string;
  candidates: AdjustmentCandidate[];
}): AdjustmentCalendar {
```

升目オブジェクト生成部（`const day: CalendarDay = { ... }`）に:

```ts
      isSelected: dateKey === selectedDateKey,
      isToday: dateKey === todayDateKey,
```

(c) 既存テスト `tests/plan/adjustment-calendar.test.ts` の `buildAdjustmentCalendar({...})` 呼び出しすべてに `todayDateKey: "2026-07-01"` を追加（`vitest.setup.ts` の固定時刻の当日）。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/plan/adjustment-calendar.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: 型チェック（他の呼び出し元を洗い出す）**

Run: `npx tsc --noEmit`
Expected: `components/plan/adjustment-calendar-view.tsx` で `todayDateKey` が無いという型エラー1件のみ（Task 2 で直す）。他にエラーがあれば、その呼び出し元にも `todayDateKey` を渡す（`grep -rn "buildAdjustmentCalendar" --include=*.tsx --include=*.ts`）。

- [ ] **Step 6: コミット**

```bash
git add lib/domain/plan/adjustment-calendar.ts tests/plan/adjustment-calendar.test.ts
git commit -m "feat(calendar): CalendarDay に isToday（buildAdjustmentCalendar が todayDateKey を受ける）"
```

> このコミット単体では `adjustment-calendar-view.tsx` が型エラーのまま。Task 2 とセットで CI を通す前提。subagent-driven なら Task 2 完了までレビューを保留してよい。

---

## Task 2: `dayCellClass` を作り替え（#5 選択日 pine 塗り＋今日マーカー / #6 土日祝の背景廃止）

**Files:**
- Modify: `lib/shared/calendar-styles.ts`
- Modify: `components/plan/adjustment-calendar-view.tsx`
- Test: `tests/calendar/calendar-styles.test.ts`
- Test: `tests/plan/adjustment-calendar-view.test.tsx`

**Interfaces:**
- Consumes: `CalendarDay.isToday`（Task 1）
- Produces:
  - `dayCellClass(day: { dateKey: string; isSelected: boolean; isCurrentMonth: boolean })` — `date` は不要になる（曜日で分岐しないため）。ただし後方互換のため `date` を optional で残す
  - 新関数 `dayCellTextClass(day: { dateKey: string; date: Date }): string` — 曜日・祝日の文字色だけを返す

- [ ] **Step 1: 失敗するテストを書く（calendar-styles）**

`tests/calendar/calendar-styles.test.ts` を新仕様に更新。`describe("dayCellClass", ...)` を丸ごと差し替え:

```ts
describe("dayCellClass", () => {
  it("選択日は pine グラデで塗る（他のどの状態より優先）", () => {
    expect(dayCellClass(day({ isSelected: true }))).toBe(
      "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white shadow-soft"
    );
  });

  it("今日（選択中でない）は太い pine 枠", () => {
    expect(dayCellClass(day({ isToday: true }))).toBe(
      "border-2 border-pine bg-surface text-ink hover:border-pine"
    );
  });

  it("当月外の升目は muted", () => {
    expect(dayCellClass(day({ isCurrentMonth: false }))).toBe(
      "border-line bg-surface text-muted hover:border-moss/35"
    );
  });

  it("土日祝でも背景は付けず、通常の升目と同じ面にする", () => {
    // 2026-07-18 は土曜、2026-07-20 は海の日
    expect(dayCellClass(day({ date: new Date(2026, 6, 18), dateKey: "2026-07-18" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
    expect(dayCellClass(day({ date: new Date(2026, 6, 20), dateKey: "2026-07-20" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
  });

  it("平日も同じ", () => {
    expect(dayCellClass(day({ dateKey: "2026-07-15" }))).toBe(
      "border-line bg-surface text-ink hover:border-moss/45"
    );
  });
});

describe("dayCellTextClass", () => {
  it("日曜・祝日は赤文字", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 19), dateKey: "2026-07-19" })).toBe("text-clay-ink"); // 日曜
    expect(dayCellTextClass({ date: new Date(2026, 6, 20), dateKey: "2026-07-20" })).toBe("text-clay-ink"); // 海の日(月)
  });

  it("土曜は青文字", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 18), dateKey: "2026-07-18" })).toBe("text-sky-800");
  });

  it("平日は色を足さない", () => {
    expect(dayCellTextClass({ date: new Date(2026, 6, 15), dateKey: "2026-07-15" })).toBe("");
  });
});
```

`day()` ヘルパーに `isToday: false` を追加:

```ts
function day(overrides: Partial<{ date: Date; dateKey: string; isSelected: boolean; isToday: boolean; isCurrentMonth: boolean }> = {}) {
  return {
    date: new Date(2026, 6, 15),
    dateKey: "2026-07-15",
    isSelected: false,
    isToday: false,
    isCurrentMonth: true,
    ...overrides
  };
}
```

`import { dayCellClass, dayCellTextClass, weekdayClass } from "@/lib/shared/calendar-styles";` に更新。

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/calendar/calendar-styles.test.ts --reporter=dot`
Expected: FAIL（`dayCellTextClass` が無い、`dayCellClass` の出力が旧仕様）

- [ ] **Step 3: `calendar-styles.ts` を実装**

`lib/shared/calendar-styles.ts` を全面差し替え:

```ts
import { isJapaneseHoliday } from "@/lib/domain/calendar/japanese-holidays";

export function weekdayClass(index: number) {
  if (index === 0) {
    return "text-clay-ink";
  }

  if (index === 6) {
    return "text-sky-700";
  }

  return "text-muted";
}

/**
 * 升目の面。面（背景）を敷くのは「選択日・今日・当月外」だけ。
 * 土日祝は面では区別せず、文字色（dayCellTextClass）だけで示す。
 */
export function dayCellClass(day: { isSelected: boolean; isToday: boolean; isCurrentMonth: boolean }) {
  if (day.isSelected) {
    return "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white shadow-soft";
  }

  if (day.isToday) {
    return "border-2 border-pine bg-surface text-ink hover:border-pine";
  }

  if (!day.isCurrentMonth) {
    return "border-line bg-surface text-muted hover:border-moss/35";
  }

  return "border-line bg-surface text-ink hover:border-moss/45";
}

/**
 * 曜日・祝日の文字色だけ。dayCellClass が返す面の上に重ねる。
 * 選択日（白文字）・当月外（muted）には呼び出し側で足さないこと。
 */
export function dayCellTextClass(day: { date: Date; dateKey: string }) {
  const dayIndex = day.date.getDay();

  if (dayIndex === 0 || isJapaneseHoliday(day.dateKey)) {
    return "text-clay-ink";
  }

  if (dayIndex === 6) {
    return "text-sky-800";
  }

  return "";
}
```

- [ ] **Step 4: calendar-styles テストが通ることを確認**

Run: `npx vitest run tests/calendar/calendar-styles.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: view の失敗するテストを書く**

`tests/plan/adjustment-calendar-view.test.tsx` に追記。`vi.mock("next/navigation", ...)` は既にあり、`vitest.setup.ts` で now=2026-07-01 固定。

```ts
it("今日の升目に「今日」ラベルを出す", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) }));

  render(
    <AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-10" candidates={[]} />
  );

  await waitFor(() => {
    expect(screen.getByText("今日")).toBeInTheDocument();
  });
});

it("表示月が当月でなければ「今日」ラベルは出ない", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) }));

  render(
    <AdjustmentCalendarView month="2026-09" selectedDateKey="2026-09-10" candidates={[]} />
  );

  await waitFor(() => {
    expect(screen.getByTestId("adjustment-month-grid")).toBeInTheDocument();
  });
  expect(screen.queryByText("今日")).not.toBeInTheDocument();
});
```

- [ ] **Step 6: view を実装**

`components/plan/adjustment-calendar-view.tsx`:

(a) import 追加:

```ts
import { dayCellClass, dayCellTextClass, weekdayClass } from "@/lib/shared/calendar-styles";
import { toJstDateKey } from "@/lib/shared/jst";
```

（`dayCellClass` は既に import 済みなので行を差し替え）

(b) `AdjustmentCalendarView` の本体、`buildAdjustmentCalendar` 呼び出しの直前に:

```ts
  const todayDateKey = toJstDateKey(new Date());
```

呼び出しに引数を足す:

```ts
  const calendar = buildAdjustmentCalendar({ year, month: monthNumber, selectedDateKey, todayDateKey, candidates });
```

(c) 升目の `<Link>` の className と中身を更新。現在:

```tsx
                    className={clsx(
                      "min-h-16 rounded-control border p-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-20 sm:p-2",
                      dayCellClass(day)
                    )}
```

を:

```tsx
                    className={clsx(
                      "relative min-h-16 rounded-control border p-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-clay sm:min-h-20 sm:p-2",
                      dayCellClass(day)
                    )}
```

`<span className="text-sm font-bold">{day.day}</span>` を:

```tsx
                    <span
                      className={clsx(
                        "text-sm font-bold",
                        !day.isSelected && day.isCurrentMonth ? dayCellTextClass(day) : null
                      )}
                    >
                      {day.day}
                    </span>
                    {day.isToday && !day.isSelected ? (
                      <span className="absolute right-1 top-1 rounded-full bg-pine px-1 text-[10px] font-bold leading-4 text-white">
                        今日
                      </span>
                    ) : null}
```

- [ ] **Step 7: view テストが通ることを確認**

Run: `npx vitest run tests/plan/adjustment-calendar-view.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 8: 型チェック・関連テスト**

Run: `npx tsc --noEmit`
Expected: エラーなし（Task 1 の型エラーもここで解消）

Run: `npx vitest run tests/plan/adjustment-calendar.test.ts tests/calendar/calendar-styles.test.ts tests/plan/adjustment-calendar-view.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add lib/shared/calendar-styles.ts components/plan/adjustment-calendar-view.tsx tests/calendar/calendar-styles.test.ts tests/plan/adjustment-calendar-view.test.tsx
git commit -m "feat(calendar): 選択日を pine 塗り＋今日マーカー、土日祝の背景を全廃"
```

---

## Task 3: 「今日」に戻るボタン（#3）

**Files:**
- Modify: `lib/domain/calendar/calendar-month.ts`
- Modify: `components/plan/adjustment-calendar-view.tsx`
- Test: `tests/calendar/calendar-month.test.ts`
- Test: `tests/plan/adjustment-calendar-view.test.tsx`

**Interfaces:**
- Produces: `isDisplayingCurrentMonth(month: string, now: Date): boolean`（`month` は `"YYYY-MM"`。JST 当月と一致するか）

- [ ] **Step 1: 失敗するテストを書く**

`tests/calendar/calendar-month.test.ts` に追記:

```ts
import { isDisplayingCurrentMonth } from "@/lib/domain/calendar/calendar-month";

describe("isDisplayingCurrentMonth", () => {
  it("表示中の月が JST 当月と一致すれば true", () => {
    expect(isDisplayingCurrentMonth("2026-07", new Date("2026-07-15T12:00:00+09:00"))).toBe(true);
  });

  it("別の月なら false", () => {
    expect(isDisplayingCurrentMonth("2026-09", new Date("2026-07-15T12:00:00+09:00"))).toBe(false);
  });

  it("JST 深夜（UTC では前月）でも JST 基準で判定する", () => {
    // JST 2026-08-01 00:30 = UTC 2026-07-31 15:30
    expect(isDisplayingCurrentMonth("2026-08", new Date("2026-07-31T15:30:00Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/calendar/calendar-month.test.ts --reporter=dot`
Expected: FAIL（`isDisplayingCurrentMonth` が無い）

- [ ] **Step 3: 実装**

`lib/domain/calendar/calendar-month.ts` に追記（ファイル先頭に import）:

```ts
import { toJstDateKey } from "@/lib/shared/jst";

// ... 既存の関数 ...

/** 表示中の月（"YYYY-MM"）が JST の当月と一致するか。 */
export function isDisplayingCurrentMonth(month: string, now: Date) {
  return toJstDateKey(now).slice(0, 7) === month;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/calendar/calendar-month.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: view の失敗するテストを書く**

`tests/plan/adjustment-calendar-view.test.tsx` に追記:

```ts
it("別の月を表示中は「今日」ボタンを出す", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) }));

  render(<AdjustmentCalendarView month="2026-09" selectedDateKey="2026-09-10" candidates={[]} />);

  await waitFor(() => {
    const link = screen.getByRole("link", { name: "今日に戻る" });
    expect(link).toHaveAttribute("href", "/plans?month=2026-07&date=2026-07-01");
  });
});

it("当月を表示中は「今日」ボタンを出さない", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false, busy: [] }) }));

  render(<AdjustmentCalendarView month="2026-07" selectedDateKey="2026-07-10" candidates={[]} />);

  await waitFor(() => {
    expect(screen.getByTestId("adjustment-month-grid")).toBeInTheDocument();
  });
  expect(screen.queryByRole("link", { name: "今日に戻る" })).not.toBeInTheDocument();
});
```

> 注: href の `date` は `toJstDateKey(new Date())`。now=2026-07-01 固定なので `2026-07-01`。

- [ ] **Step 6: view を実装**

`components/plan/adjustment-calendar-view.tsx`:

(a) import に追加:

```ts
import { dateLabel as formatDateLabel, defaultDateForMonth, isDisplayingCurrentMonth, monthLabel, moveMonth, parseMonth } from "@/lib/domain/calendar/calendar-month";
```

(b) 本体、`todayDateKey` の直後:

```ts
  const showTodayLink = !isDisplayingCurrentMonth(month, new Date());
  const todayMonth = todayDateKey.slice(0, 7);
```

(c) 月ヘッダーの `<div className="flex items-center justify-between gap-3">` を、右端に「今日」ピルを足せる形にする。`AdjustmentMonthPicker` と「次の月」`<Link>` の間、またはヘッダー下に1行。設計 #3 は「月ヘッダーの右端」。`justify-between` の3要素（前月 / ピッカー / 次月）を崩さないため、ヘッダーの下に薄い行を足す:

`</div>`（月ヘッダー閉じ）の直後、`<div className="mt-4 flex flex-wrap gap-2 ...">`（凡例）の直前に:

```tsx
        {showTodayLink ? (
          <div className="mt-3 flex justify-end">
            <Link
              href={`/plans?month=${todayMonth}&date=${todayDateKey}`}
              scroll={false}
              className="inline-flex min-h-9 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-sm font-bold text-pine transition-colors hover:border-pine focus:outline-none focus:ring-2 focus:ring-clay"
            >
              今日に戻る
            </Link>
          </div>
        ) : null}
```

- [ ] **Step 7: テスト・型**

Run: `npx vitest run tests/calendar/calendar-month.test.ts tests/plan/adjustment-calendar-view.test.tsx --reporter=dot`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add lib/domain/calendar/calendar-month.ts components/plan/adjustment-calendar-view.tsx tests/calendar/calendar-month.test.ts tests/plan/adjustment-calendar-view.test.tsx
git commit -m "feat(calendar): 別の月を見ているときだけ「今日に戻る」ボタン"
```

---

## Task 4: 月ピッカーを 12ヶ月グリッド＋年ホイールに（#7）

**Files:**
- Modify: `lib/domain/calendar/calendar-month.ts`
- Rewrite: `components/plan/adjustment-month-picker.tsx`
- Test: `tests/calendar/calendar-month.test.ts`
- Test: `tests/plan/adjustment-month-picker.test.tsx`

**Interfaces:**
- Consumes: `parseMonth`, `monthParam`, `monthLabel`（既存）
- Produces: `pickerYearRange(currentMonth: string, now: Date): number[]` — 当年 −3〜+3 の7年。currentMonth の年がこの範囲外なら currentMonth の年を含むよう寄せる

- [ ] **Step 1: 失敗するテストを書く（calendar-month）**

`tests/calendar/calendar-month.test.ts` に追記:

```ts
import { pickerYearRange } from "@/lib/domain/calendar/calendar-month";

describe("pickerYearRange", () => {
  it("当年 −3〜+3 の7年を返す", () => {
    expect(pickerYearRange("2026-07", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2023, 2024, 2025, 2026, 2027, 2028, 2029
    ]);
  });

  it("表示中の年が範囲より先なら、その年まで伸ばす", () => {
    expect(pickerYearRange("2031-01", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031
    ]);
  });

  it("表示中の年が範囲より前なら、その年から始める", () => {
    expect(pickerYearRange("2020-01", new Date("2026-07-01T12:00:00+09:00"))).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029
    ]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run tests/calendar/calendar-month.test.ts --reporter=dot`
Expected: FAIL

- [ ] **Step 3: `pickerYearRange` を実装**

`lib/domain/calendar/calendar-month.ts` に追記:

```ts
/** 月ピッカーの年ホイールに出す年の並び。基本は当年 ±3。表示中の年が外なら含むまで伸ばす。 */
export function pickerYearRange(currentMonth: string, now: Date): number[] {
  const currentYear = Number(toJstDateKey(now).slice(0, 4));
  const shownYear = parseMonth(currentMonth).year;
  const from = Math.min(currentYear - 3, shownYear);
  const to = Math.max(currentYear + 3, shownYear);
  const years: number[] = [];
  for (let year = from; year <= to; year += 1) {
    years.push(year);
  }
  return years;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/calendar/calendar-month.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 5: 月ピッカーの失敗するテストを書く**

`tests/plan/adjustment-month-picker.test.tsx`（新規）:

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

import { AdjustmentMonthPicker } from "@/components/plan/adjustment-month-picker";

describe("AdjustmentMonthPicker", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("OS 標準の month input を使わない", () => {
    const { container } = render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);
    expect(container.querySelector('input[type="month"]')).toBeNull();
  });

  it("年ボタンと12ヶ月グリッドを出す", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);
    // 年（当年 ±3 = 2023..2029）
    expect(screen.getByRole("button", { name: "2026年" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2029年" })).toBeInTheDocument();
    // 月
    for (const m of ["1月", "6月", "12月"]) {
      expect(screen.getByRole("button", { name: m })).toBeInTheDocument();
    }
  });

  it("月をタップすると /plans?month=YYYY-MM&date=YYYY-MM-01 に push する", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);

    fireEvent.click(screen.getByRole("button", { name: "3月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2026-03&date=2026-03-01", { scroll: false });
  });

  it("年を変えてから月をタップすると、その年月に push する", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);

    fireEvent.click(screen.getByRole("button", { name: "2028年" }));
    fireEvent.click(screen.getByRole("button", { name: "11月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2028-11&date=2028-11-01", { scroll: false });
  });
});
```

- [ ] **Step 6: テストが落ちることを確認**

Run: `npx vitest run tests/plan/adjustment-month-picker.test.tsx --reporter=dot`
Expected: FAIL

- [ ] **Step 7: `adjustment-month-picker.tsx` を書き換え**

`components/plan/adjustment-month-picker.tsx` を全面差し替え:

```tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays } from "lucide-react";

import { parseMonth, pickerYearRange } from "@/lib/domain/calendar/calendar-month";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function AdjustmentMonthPicker({ currentMonth, label }: { currentMonth: string; label: string }) {
  const router = useRouter();
  const { year: shownYear, month: shownMonthNumber } = parseMonth(currentMonth);
  const years = pickerYearRange(currentMonth, new Date());
  const [selectedYear, setSelectedYear] = useState(shownYear);

  function goToMonth(monthNumber: number) {
    const monthParam = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
    router.push(`/plans?month=${monthParam}&date=${monthParam}-01`, { scroll: false });
  }

  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-base font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay sm:px-4 sm:text-xl [&::-webkit-details-marker]:hidden">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-pine sm:h-5 sm:w-5" />
        {label}
      </summary>
      <div className="absolute left-1/2 z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-control border border-line bg-cream p-3 shadow-lift">
        <div className="flex gap-3">
          {/* 年ホイール: 縦スクロール＋中央スナップ。各年は実ボタン。 */}
          <div
            className="relative h-40 w-20 shrink-0 snap-y snap-mandatory overflow-y-auto scroll-py-16 rounded-control border border-line bg-surface [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
            aria-label="年を選ぶ"
          >
            <div className="py-16">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  aria-pressed={year === selectedYear}
                  className={clsx(
                    "block w-full snap-center py-2 text-center text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                    year === selectedYear ? "text-pine" : "text-muted hover:text-ink"
                  )}
                >
                  {year}年
                </button>
              ))}
            </div>
            {/* 中央の選択帯 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-pine/40"
              style={{ height: "2.25rem" }}
            />
          </div>

          {/* 12ヶ月グリッド */}
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {MONTHS.map((monthNumber) => {
              const isCurrent = selectedYear === shownYear && monthNumber === shownMonthNumber;
              return (
                <button
                  key={monthNumber}
                  type="button"
                  onClick={() => goToMonth(monthNumber)}
                  className={clsx(
                    "min-h-11 rounded-control border text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                    isCurrent
                      ? "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white"
                      : "border-line bg-surface text-ink hover:border-moss"
                  )}
                >
                  {monthNumber}月
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
}
```

> 年ホイールのスクロールスナップは CSS のみ（`snap-y snap-mandatory` + 各年 `snap-center`）。スクロールで中央に来た年を自動選択するのは JS のスクロールリスナが要るが、v1 では**タップ選択で十分**とする（設計は「スクロールでも中央スナップで選択が変わる」が理想、`tuning-ui-visually` で実機調整する Task 5 で詰める）。キーボードは Tab で年ボタン、Enter/Space で選択。

- [ ] **Step 8: テストが通ることを確認**

Run: `npx vitest run tests/plan/adjustment-month-picker.test.tsx --reporter=dot`
Expected: PASS

- [ ] **Step 9: 型チェック・関連テスト**

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npx vitest run tests/plan/adjustment-calendar-view.test.tsx tests/calendar/calendar-month.test.ts --reporter=dot`
Expected: PASS（`AdjustmentMonthPicker` は `AdjustmentCalendarView` から使われる。props は `currentMonth` / `label` で不変）

- [ ] **Step 10: コミット**

```bash
git add lib/domain/calendar/calendar-month.ts components/plan/adjustment-month-picker.tsx tests/calendar/calendar-month.test.ts tests/plan/adjustment-month-picker.test.tsx
git commit -m "feat(calendar): 月ピッカーを12ヶ月グリッド＋年ホイールに（OS標準month inputを撤去）"
```

---

## Task 5: 全体検証と実ブラウザ確認、PR

- [ ] **Step 1: 全テスト・型・lint**

Run: `npx vitest run --reporter=dot`
Expected: 全 PASS

Run: `npx tsc --noEmit`
Expected: エラーなし

Run: `npx eslint .`
Expected: エラーなし

- [ ] **Step 2: 実ブラウザ確認（`npm run dev`、375px とデスクトップ幅）**

`/plans` を開いて確認:

| 画面 | 見るもの | NG |
|---|---|---|
| 初期表示（当月・今日選択） | 今日のセルが pine グラデで塗られ、ひと目で分かる | 薄くて埋もれる／土曜だけ背景が違う |
| 別の日を選択 | 選択セル（塗り）と今日セル（枠＋右上「今日」ラベル）が同時に見える | ラベルがはみ出てクリップ／重なる |
| 月グリッド全体 | 面が付いているのは選択日・今日・当月外だけ。土日祝は文字色（日/祝=赤・土=青）のみ | 土日祝に背景色が残っている |
| 別の月へ移動 | ヘッダー下に「今日に戻る」が出る。押すと当月・今日で開く | 当月表示中にも出ている |
| 月ピッカーを開く | OS 標準の month input が出ない。左に年ホイール（当年±3）、右に4×3の月グリッド。現在の年月が pine ハイライト | パネルが画面幅からはみ出す（375px）／年ホイールがスクロールできない |
| 月ピッカーで月をタップ | その年月・月初でカレンダーが開き、パネルが閉じる | 確定ボタンを押さないと遷移しない |
| `prefers-reduced-motion: reduce`（DevTools で強制） | 年ホイールのスムーススクロールが切れる | |

- [ ] **Step 3: 年ホイールの微調整（必要なら `tuning-ui-visually`）**

実機で年ホイールの高さ・スナップ位置・フェード・選択帯の見え方を1ラウンド調整（設計 #7 / grill Q3）。値だけの調整なら `tuning-ui-visually` スキルを使い、返った値をコンポーネントに反映してコミット。

- [ ] **Step 4: ブランチを push して PR**

```bash
git push -u origin feat/calendar-brushup
gh pr create --draft --base main --title "カレンダー手直し（Batch A / PR-2）: 今日ボタン・選択日の塗り・土日祝背景の撤去・月ピッカー刷新" --body "設計: docs/superpowers/specs/2026-08-31-home-calendar-list-brushup-design.md（#3/#5/#6/#7）/ 計画: docs/superpowers/plans/2026-09-07-calendar-brushup-pr2.md"
```

- [ ] **Step 5: Codex 全体レビュー → 指摘対応 → CI 確認 → マージ承認をユーザーに依頼**

---

## Self-Review

**1. Spec coverage:**

| 設計の項目 | 対応タスク |
|---|---|
| #3 「今日」ボタン（別月のときだけ、JST、当月なら非表示） | Task 3（`isDisplayingCurrentMonth` + view） |
| #5 選択日 = pine グラデ塗り | Task 2（`dayCellClass` の isSelected 分岐） |
| #5 今日 = 太枠＋「今日」ラベル、選択と今日が別日なら両方見える | Task 2（isToday 分岐 + view のラベル、`!day.isSelected` ガード） |
| #5 `CalendarDay.isToday` 追加、`buildAdjustmentCalendar` に today を渡す | Task 1 |
| #5 隣月セルでも今日マーカーを付ける | Task 1（`todayDateKey === dateKey` は isCurrentMonth を見ない）+ Task 2 のテスト |
| #6 土日祝の背景（bg-*）を全廃、文字色は残す | Task 2（`dayCellClass` から曜日分岐を除去、`dayCellTextClass` 新設） |
| #6 hover 枠も土日祝で分けない | Task 2（全セル `hover:border-moss/45` 系に統一） |
| #6 面を使うのは選択日・今日・当月外のみ | Task 2 |
| #7 `<input type="month">` 撤去、12ヶ月グリッド＋年ホイール | Task 4 |
| #7 年範囲 当年 ±3 | Task 4（`pickerYearRange`） |
| #7 月タップで push して details を閉じる、確定ボタン不要 | Task 4（`goToMonth`、`<details>` のネイティブ挙動） |
| #7 `prefers-reduced-motion` | Task 4（`motion-reduce:scroll-auto`） |
| #7 375px で収まる | Task 4（`w-[min(20rem,calc(100vw-2rem))]`）+ Task 5 目視 |
| #7 年ホイールのキーボード操作 | Task 4（実 `<button>` の集合、`aria-pressed`、focus ring） |
| テスト方針: ドメイン関数は Vitest で RED 先行 | 各タスク Step 1-2 |
| 見た目の変更は実ブラウザ確認してから完了 | Task 5 |
| 年ホイールの実機微調整1ラウンド | Task 5 Step 3 |

**未カバー / 意図的な簡略化:**
- 設計 #7「スクロールでも中央スナップで選択が変わる」— v1 はタップ選択のみ。スクロール位置から選択年を自動更新する JS は Task 5 の実機調整で必要性を判断（計画に明記）。
- 設計 #5「セル内のドット（honey）を白基調に」— 選択セルは白文字なので `DayDots` の honey ドットが選択セル上で沈む可能性。Task 2 Step 6 で選択セル時のドット色を確認し、必要なら `DayDots` に `day.isSelected` を渡して白系に（実装者判断、コミットメッセージに記録）。

**2. Placeholder scan:** なし。「必要なら」の判断ポイントは2箇所（選択セルのドット色 / 年ホイールのスクロール自動選択）で、どちらも「判断結果をコミットに残す」と明記。

**3. Type consistency:**
- `CalendarDay.isToday: boolean`（Task 1）→ `dayCellClass(day: { isSelected; isToday; isCurrentMonth })`（Task 2）で消費。一致。
- `dayCellClass` の引数から `date` を除去（Task 2）。呼び出しは view の `dayCellClass(day)` で `day` は `CalendarDay`（`isSelected`/`isToday`/`isCurrentMonth` を持つ）。余分な `date`/`dateKey` プロパティがあっても構造的部分型で通る。
- `dayCellTextClass(day: { date: Date; dateKey: string })`（Task 2）← `CalendarDay` は両方持つ。一致。
- `isDisplayingCurrentMonth(month: string, now: Date)`（Task 3）/ `pickerYearRange(currentMonth: string, now: Date)`（Task 4）— 両方 `now: Date` を第2引数に取る。view / picker は `new Date()` を渡す。一致。
- `buildAdjustmentCalendar` の引数追加（Task 1）→ 唯一の呼び出し元 `adjustment-calendar-view.tsx` を Task 2 で更新。他呼び出し元は Task 1 Step 5 で grep 確認。
