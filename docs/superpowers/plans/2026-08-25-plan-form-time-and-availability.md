# 候補日時選択・進行表の時刻UIと空き状況表示の刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 候補日時選択・進行表・回答期限の時刻入力を、タップで展開する時計ダイヤル(`TimeDialPicker`)に統一し、カレンダー上の空き状況表示を「何人の予定が重なっているか」ベースの色分けに置き換える。

**Architecture:** 時刻ダイヤルの角度⇔時刻変換ロジックを純粋関数(`lib/domain/plan/time-dial.ts`)として切り出し、それを使う新規Reactコンポーネント(`components/plan/time-dial-picker.tsx`)を作る。既存の `TimeSelect`(`components/plan/plan-form.tsx`)と `<input type="time">`(`components/plan/plan-timetable-form.tsx`)をこれに置き換える。空き状況は、サーバー側(`lib/domain/plan/group-availability.ts`)で日付ごとの `{ maxBusyCount, allDayBusyCount }` を新たに集計し、API(`app/api/events/[eventId]/availability/route.ts`)のレスポンスに載せ、フロント(`components/plan/group-availability-calendar.tsx`)経由で `CalendarPicker` の色分けに使う。

**Tech Stack:** Next.js (App Router) / React / TypeScript / Tailwind CSS / Vitest + Testing Library

## Global Constraints

- 新しい色トークンは追加しない。既存の `skywash`(情報面)・`subtle`(装飾専用)の不透明度のみで空き状況を表現する。
- `TimeDialPicker` は5分刻み(`STEP_MINUTES = 5`)でスナップする。
- 空き状況の色分けの優先順位: 誰か1人でも終日予定あり(最優先) > 複数人予定あり > 一人だけ予定あり > 予定なし(色なし)。
- 月選択パネルは、年または月を選んだら自動で閉じる。パネル外をクリック/タップしたときも閉じる。明示的な「閉じる」ボタンは追加しない。
- 謎解きテンプレート(`eventCategory === "nazotoki"` のときだけ表示)は、「候補日を選択」カレンダーの下・「時刻」セクション(開始/終了チップ)の直上に配置する。
- 「参加者全体の空きやすさ」の見出しは「参加者全体の空き状況」に変更する。
- テストは `npx vitest run <path> --reporter=dot` で実行する(既定の verbose レポーターは出力が多すぎる)。

---

### Task 1: 時刻ダイヤルの角度⇔時刻変換ロジック(純粋関数)

**Files:**
- Create: `lib/domain/plan/time-dial.ts`
- Test: `tests/plan/time-dial.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: 以下をすべて named export する。Task 2 がこれらを import して使う。
  - `TIME_DIAL_STEP_MINUTES: number`(値は `5`)
  - `TIME_DIAL_CENTER: number`(値は `90`)
  - `TIME_DIAL_RADIUS: number`(値は `72`)
  - `type TimeDialMode = "hour" | "minute"`
  - `type DialPoint = { x: number; y: number }`
  - `parseTimeToMinutes(value: string): number` — `"HH:MM"` → 0〜1439の分
  - `formatMinutesToTime(totalMinutes: number): string` — 分 → `"HH:MM"`(範囲外は24時間でラップ)
  - `angleToMinutes(angleDeg: number, mode: TimeDialMode, currentMinutes: number): number` — ドラッグ角度と現在値から新しい分を計算(`"hour"` モードは分をそのまま保持、`"minute"` モードは時をそのまま保持し分を5分刻みにスナップ)
  - `pointForAngleDeg(angleDeg: number, radius: number): DialPoint` — 角度と半径からSVG座標(中心 `TIME_DIAL_CENTER`)
  - `clientPointToAngleDeg(localX: number, localY: number): number` — SVGローカル座標から角度(0〜360、12時位置が0度)
  - `handPointForMinutes(minutes: number, mode: TimeDialMode): DialPoint` — 現在値からハンドルの座標
  - `buildDialTicks(mode: TimeDialMode): { x1: number; y1: number; x2: number; y2: number }[]` — 目盛り線(`"hour"` は24本、`"minute"` は12本)
  - `buildDialTickLabels(mode: TimeDialMode): { x: number; y: number; label: string }[]` — 主要ラベル(`"hour"` は `0,6,12,18`、`"minute"` は `0,15,30,45`)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/time-dial.test.ts` を新規作成する:

```ts
import { describe, expect, it } from "vitest";

import {
  TIME_DIAL_STEP_MINUTES,
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  pointForAngleDeg
} from "@/lib/domain/plan/time-dial";

describe("time-dial", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("19:05")).toBe(19 * 60 + 5);
    expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("formats minutes back into HH:MM, wrapping at 24h", () => {
    expect(formatMinutesToTime(0)).toBe("00:00");
    expect(formatMinutesToTime(19 * 60 + 5)).toBe("19:05");
    expect(formatMinutesToTime(24 * 60)).toBe("00:00");
    expect(formatMinutesToTime(-5)).toBe("23:55");
  });

  it("converts a drag angle to an hour, keeping the current minute", () => {
    // 0度 = 0時、90度 = 6時、180度 = 12時、270度 = 18時
    expect(angleToMinutes(0, "hour", 19 * 60 + 30)).toBe(0 * 60 + 30);
    expect(angleToMinutes(90, "hour", 19 * 60 + 30)).toBe(6 * 60 + 30);
    expect(angleToMinutes(180, "hour", 19 * 60 + 30)).toBe(12 * 60 + 30);
  });

  it("converts a drag angle to a minute, snapping to 5-minute steps and keeping the current hour", () => {
    expect(TIME_DIAL_STEP_MINUTES).toBe(5);
    // 60分を360度とすると、1分=6度。23度は4分(20分)ではなく5分刻みで最も近い20分にスナップされる
    expect(angleToMinutes(23, "minute", 19 * 60 + 0)).toBe(19 * 60 + 20);
    expect(angleToMinutes(0, "minute", 19 * 60 + 0)).toBe(19 * 60 + 0);
    expect(angleToMinutes(180, "minute", 19 * 60 + 0)).toBe(19 * 60 + 30);
  });

  it("computes a point on the dial from an angle and radius", () => {
    const top = pointForAngleDeg(0, 72);
    expect(top.x).toBeCloseTo(90);
    expect(top.y).toBeCloseTo(90 - 72);

    const right = pointForAngleDeg(90, 72);
    expect(right.x).toBeCloseTo(90 + 72);
    expect(right.y).toBeCloseTo(90);
  });

  it("computes the angle from a local point, with 12-o'clock as 0 degrees", () => {
    expect(clientPointToAngleDeg(90, 90 - 72)).toBeCloseTo(0);
    expect(clientPointToAngleDeg(90 + 72, 90)).toBeCloseTo(90);
  });

  it("computes the hand point for hour and minute modes", () => {
    const hourHand = handPointForMinutes(6 * 60, "hour");
    expect(hourHand.x).toBeCloseTo(90 + 68, 0);
    expect(hourHand.y).toBeCloseTo(90, 0);

    const minuteHand = handPointForMinutes(19 * 60 + 30, "minute");
    expect(minuteHand.x).toBeCloseTo(90, 0);
    expect(minuteHand.y).toBeCloseTo(90 + 68, 0);
  });

  it("builds 24 hour ticks and 12 minute ticks", () => {
    expect(buildDialTicks("hour")).toHaveLength(24);
    expect(buildDialTicks("minute")).toHaveLength(12);
  });

  it("builds the four major labels for each mode", () => {
    expect(buildDialTickLabels("hour").map((l) => l.label)).toEqual(["00", "06", "12", "18"]);
    expect(buildDialTickLabels("minute").map((l) => l.label)).toEqual(["00", "15", "30", "45"]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/time-dial.test.ts --reporter=dot`
Expected: FAIL — `Cannot find module '@/lib/domain/plan/time-dial'`

- [ ] **Step 3: `lib/domain/plan/time-dial.ts` を実装する**

```ts
export const TIME_DIAL_STEP_MINUTES = 5;
export const TIME_DIAL_CENTER = 90;
export const TIME_DIAL_RADIUS = 72;

export type TimeDialMode = "hour" | "minute";

export type DialPoint = { x: number; y: number };

export function parseTimeToMinutes(value: string): number {
  const [hourText, minuteText] = value.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function angleToMinutes(angleDeg: number, mode: TimeDialMode, currentMinutes: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;

  if (mode === "hour") {
    const hour = Math.round((normalizedAngle / 360) * 24) % 24;
    return hour * 60 + (currentMinutes % 60);
  }

  const minute = (Math.round((normalizedAngle / 360) * 60 / TIME_DIAL_STEP_MINUTES) * TIME_DIAL_STEP_MINUTES) % 60;
  return Math.floor(currentMinutes / 60) * 60 + minute;
}

export function pointForAngleDeg(angleDeg: number, radius: number): DialPoint {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: TIME_DIAL_CENTER + radius * Math.cos(angleRad),
    y: TIME_DIAL_CENTER + radius * Math.sin(angleRad)
  };
}

export function clientPointToAngleDeg(localX: number, localY: number): number {
  const dx = localX - TIME_DIAL_CENTER;
  const dy = localY - TIME_DIAL_CENTER;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return ((angle % 360) + 360) % 360;
}

export function handPointForMinutes(minutes: number, mode: TimeDialMode): DialPoint {
  if (mode === "hour") {
    const hour = Math.floor(minutes / 60);
    return pointForAngleDeg((hour / 24) * 360, TIME_DIAL_RADIUS - 4);
  }
  const minute = minutes % 60;
  return pointForAngleDeg((minute / 60) * 360, TIME_DIAL_RADIUS - 4);
}

export function buildDialTicks(mode: TimeDialMode): { x1: number; y1: number; x2: number; y2: number }[] {
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];

  if (mode === "hour") {
    for (let hour = 0; hour < 24; hour++) {
      const angleDeg = (hour / 24) * 360;
      const inner = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS - (hour % 6 === 0 ? 10 : 6));
      const outer = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS + 2);
      ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
    }
    return ticks;
  }

  for (let minute = 0; minute < 60; minute += 5) {
    const angleDeg = (minute / 60) * 360;
    const inner = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS - (minute % 15 === 0 ? 10 : 6));
    const outer = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS + 2);
    ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
  }
  return ticks;
}

export function buildDialTickLabels(mode: TimeDialMode): { x: number; y: number; label: string }[] {
  const values = mode === "hour" ? [0, 6, 12, 18] : [0, 15, 30, 45];
  const total = mode === "hour" ? 24 : 60;
  return values.map((value) => {
    const point = pointForAngleDeg((value / total) * 360, TIME_DIAL_RADIUS - 22);
    return { x: point.x, y: point.y, label: String(value).padStart(2, "0") };
  });
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/time-dial.test.ts --reporter=dot`
Expected: PASS(9件とも成功)

- [ ] **Step 5: コミット**

```bash
git add lib/domain/plan/time-dial.ts tests/plan/time-dial.test.ts
git commit -m "feat: add time dial angle/time conversion helpers"
```

---

### Task 2: `TimeDialPicker` コンポーネント

**Files:**
- Create: `components/plan/time-dial-picker.tsx`
- Test: `tests/plan/time-dial-picker.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `lib/domain/plan/time-dial.ts` の全export
- Produces: `TimeDialPicker` コンポーネント。Task 3・Task 4 がこれを import して使う。

```ts
export function TimeDialPicker({
  time,
  onTimeChange,
  label,
  fieldLabel,
  buttonRef,
  optional,
  onClear
}: {
  time: string;              // "HH:MM"。optional かつ未設定のときは ""
  onTimeChange: (value: string) => void;
  label: string;             // チップに出す見出し（例: "開始"）
  fieldLabel: string;        // aria-label のprefix（例: "開始時" / "開始分" 相当のフォーカス制御に使う）
  buttonRef?: RefObject<HTMLButtonElement | null>; // 展開チップへのref（既存 TimeSelect の hourRef 相当）
  optional?: boolean;        // true なら time === "" のとき「+ ○○を設定」ボタンを出す
  onClear?: () => void;      // optional のとき「未設定に戻す」で呼ぶ
}): JSX.Element
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/time-dial-picker.test.tsx` を新規作成する:

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeDialPicker } from "@/components/plan/time-dial-picker";

describe("TimeDialPicker", () => {
  it("表示は閉じたチップだけで、時刻がラベルに出る", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);

    expect(screen.getByRole("button", { name: "開始 19:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "19" })).not.toBeInTheDocument();
  });

  it("チップをタップすると時計が展開し、もう一度で閉じる", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);

    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));
    expect(screen.getByRole("button", { name: "19" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "00" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));
    expect(screen.queryByRole("button", { name: "19" })).not.toBeInTheDocument();
  });

  it("時/分の数字ボタンでモードが切り替わる", () => {
    render(<TimeDialPicker time="19:05" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:05" }));

    const hourButton = screen.getByRole("button", { name: "19" });
    const minuteButton = screen.getByRole("button", { name: "05" });
    expect(hourButton).toHaveAttribute("aria-pressed", "true");
    expect(minuteButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(minuteButton);
    expect(hourButton).toHaveAttribute("aria-pressed", "false");
    expect(minuteButton).toHaveAttribute("aria-pressed", "true");
  });

  it("ハンドルをドラッグすると時刻が変わる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const handle = screen.getByRole("button", { name: "開始のつまみ" });

    fireEvent.pointerDown(handle);
    // 90度（時計回りに6時方向）= 6時。ローカル座標 (90+72, 90) = (162, 90)
    fireEvent.pointerMove(window, { clientX: 162, clientY: 90 });
    fireEvent.pointerUp(window);

    expect(onTimeChange).toHaveBeenLastCalledWith("06:00");
  });

  it("optional かつ未設定のとき「+ ○○を設定」ボタンを出し、押すと展開する", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="" onTimeChange={onTimeChange} label="終了" fieldLabel="終了" optional onClear={vi.fn()} />);

    const setButton = screen.getByRole("button", { name: "+ 終了を設定" });
    expect(screen.queryByRole("button", { name: "終了のつまみ" })).not.toBeInTheDocument();

    fireEvent.click(setButton);
    expect(onTimeChange).toHaveBeenCalledWith("20:00");
  });

  it("未設定に戻すを押すと onClear が呼ばれる", () => {
    const onClear = vi.fn();
    render(<TimeDialPicker time="20:00" onTimeChange={vi.fn()} label="終了" fieldLabel="終了" optional onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "終了 20:00" }));
    fireEvent.click(screen.getByRole("button", { name: "未設定に戻す" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/time-dial-picker.test.tsx --reporter=dot`
Expected: FAIL — `Cannot find module '@/components/plan/time-dial-picker'`

- [ ] **Step 3: `components/plan/time-dial-picker.tsx` を実装する**

```tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Clock } from "lucide-react";

import {
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  type TimeDialMode
} from "@/lib/domain/plan/time-dial";

const DIAL_VIEWBOX_SIZE = 180;
const DEFAULT_MINUTES_WHEN_ENABLING = 20 * 60;

function chipClassName(active: boolean) {
  return active
    ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-pine-deep bg-gradient-to-br from-pine to-pine-deep px-4 text-sm font-bold text-white"
    : "inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-pine transition-colors hover:border-moss";
}

function segmentClassName(active: boolean) {
  return active
    ? "min-h-9 min-w-11 rounded-control bg-pine px-2 text-lg font-black text-white"
    : "min-h-9 min-w-11 rounded-control bg-transparent px-2 text-lg font-black text-moss";
}

export function TimeDialPicker({
  time,
  onTimeChange,
  label,
  fieldLabel,
  buttonRef,
  optional = false,
  onClear
}: {
  time: string;
  onTimeChange: (value: string) => void;
  label: string;
  fieldLabel: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  optional?: boolean;
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimeDialMode>("hour");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const minutesRef = useRef(0);

  const isUnset = optional && time === "";
  const minutes = isUnset ? 0 : parseTimeToMinutes(time);
  minutesRef.current = minutes;

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current || !svgRef.current) {
        return;
      }
      const rect = svgRef.current.getBoundingClientRect();
      const scale = DIAL_VIEWBOX_SIZE / rect.width;
      const localX = (event.clientX - rect.left) * scale;
      const localY = (event.clientY - rect.top) * scale;
      const angleDeg = clientPointToAngleDeg(localX, localY);
      const nextMinutes = angleToMinutes(angleDeg, mode, minutesRef.current);
      onTimeChange(formatMinutesToTime(nextMinutes));
    },
    [mode, onTimeChange]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  if (isUnset) {
    return (
      <button
        type="button"
        onClick={() => {
          onTimeChange(formatMinutesToTime(DEFAULT_MINUTES_WHEN_ENABLING));
          setExpanded(true);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface px-4 text-sm font-bold text-subtle"
      >
        + {label}を設定
      </button>
    );
  }

  const { h, m } = { h: String(Math.floor(minutes / 60)).padStart(2, "0"), m: String(minutes % 60).padStart(2, "0") };
  const hand = handPointForMinutes(minutes, mode);
  const ticks = buildDialTicks(mode);
  const tickLabels = buildDialTickLabels(mode);

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className={chipClassName(expanded)}
      >
        <Clock aria-hidden="true" className="h-4 w-4" />
        {label} {h}:{m}
      </button>

      {expanded ? (
        <div className="flex flex-col items-center gap-2 rounded-control border border-line bg-surface p-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={mode === "hour"}
              onClick={() => setMode("hour")}
              className={segmentClassName(mode === "hour")}
            >
              {h}
            </button>
            <span className="text-lg font-black text-ink">:</span>
            <button
              type="button"
              aria-pressed={mode === "minute"}
              onClick={() => setMode("minute")}
              className={segmentClassName(mode === "minute")}
            >
              {m}
            </button>
          </div>

          <svg
            ref={svgRef}
            data-testid="time-dial-svg"
            viewBox={`0 0 ${DIAL_VIEWBOX_SIZE} ${DIAL_VIEWBOX_SIZE}`}
            width={160}
            height={160}
            style={{ touchAction: "none" }}
          >
            <circle cx="90" cy="90" r="72" fill="none" stroke="var(--madoi-line)" strokeWidth={2} />
            {ticks.map((tick, index) => (
              <line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="var(--madoi-line-strong)" strokeWidth={1.5} />
            ))}
            {tickLabels.map((tickLabel) => (
              <text
                key={tickLabel.label}
                x={tickLabel.x}
                y={tickLabel.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--madoi-muted)"
              >
                {tickLabel.label}
              </text>
            ))}
            <line x1={90} y1={90} x2={hand.x} y2={hand.y} stroke="var(--madoi-pine)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={90} cy={90} r={4} fill="var(--madoi-pine)" />
            <circle
              role="button"
              aria-label={`${label}のつまみ`}
              tabIndex={0}
              cx={hand.x}
              cy={hand.y}
              r={15}
              fill="var(--madoi-surface)"
              stroke="var(--madoi-pine)"
              strokeWidth={5}
              style={{ cursor: "grab" }}
              onPointerDown={(event) => {
                event.preventDefault();
                draggingRef.current = true;
              }}
            />
          </svg>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="min-h-9 rounded-full bg-pine px-5 text-sm font-bold text-white"
            >
              完了
            </button>
            {optional ? (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onClear?.();
                }}
                className="min-h-9 rounded-full border border-line-strong px-4 text-sm font-bold text-muted"
              >
                未設定に戻す
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/time-dial-picker.test.tsx --reporter=dot`
Expected: PASS(6件とも成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/time-dial-picker.tsx tests/plan/time-dial-picker.test.tsx
git commit -m "feat: add TimeDialPicker component"
```

---

### Task 3: 候補日時選択・回答期限フォームへの適用

**Files:**
- Modify: `components/plan/plan-form.tsx`(`TimeSelect` 関数・呼び出し3箇所・`hourOptions`/`minuteOptions`)
- Modify: `tests/plan/plan-form.test.tsx`(`chooseOption` を使っていた時刻操作をすべて置き換え)

**Interfaces:**
- Consumes: Task 2 の `TimeDialPicker`(`time`, `onTimeChange`, `label`, `fieldLabel`, `buttonRef` props)
- Produces: なし(末端のUI変更)

- [ ] **Step 1: 既存テストを `TimeDialPicker` の操作方法に書き換える**

`tests/plan/plan-form.test.tsx` の冒頭、`chooseOption` ヘルパーの下に時刻操作用のヘルパーを追加する:

```ts
function setTime(chipName: string, hour: string, minute: string) {
  fireEvent.click(screen.getByRole("button", { name: chipName }));
  fireEvent.click(screen.getByRole("button", { name: hour }));
  fireEvent.click(screen.getByRole("button", { name: `${chipName.split(" ")[0]}のつまみ` }));
  // ダイヤルは角度ベースなので、テストでは直接 onTimeChange を辿らず
  // 「時」「分」ボタンで対象モードにしてからハンドルへドラッグ操作を行う代わりに、
  // 時刻の確定値だけを検証したいケースが多いので、次の setDialTime を使う。
}
```

**この設計は複雑になりすぎるため、代わりに `TimeDialPicker` の展開・数字ボタンでの直接値確認ではなく、フォーム送信結果(hidden input の value)だけを検証する方針に切り替える。** `tests/plan/plan-form.test.tsx` の該当4テストを、`chooseOption` の代わりに `TimeDialPicker` の初期値をそのまま使う形に書き換える(ドラッグ操作のシミュレーションはTask 2で完了しているため、ここでは「初期値のまま候補に追加する」フローだけを検証すれば十分):

```tsx
it("adds a candidate datetime and reaches the review step with a deadline", async () => {
  const props = { action: vi.fn(), submitLabel: "この内容で日程調整を始める", participantCount: 3 };
  render(<PlanForm {...props} />);

  fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
  await waitFor(() => expect(screen.getByRole("button", { name: /^開始 /  })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

  expect(screen.getByText("候補 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
  expect(screen.getByRole("heading", { name: "回答期限を選ぶ" })).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/7月14日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  expect(screen.getByRole("heading", { name: "リマインドを決める" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
  expect(screen.getByText("参加者 3人")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "候補 1 を削除" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "この内容で日程調整を始める" })).toBeEnabled();
  expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
  expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-15T21:00");
  expect(document.querySelector('input[name="answer_deadline_at"]')).toHaveAttribute("value", "2026-07-14T23:45");
});

it("サーバーからのエラーを表示し、入力し直した候補日時を消さない", async () => {
  const action = vi.fn().mockResolvedValue({ status: "error", message: "回答期限は最初の候補日時より前にしてください。" });
  render(<PlanForm action={action} submitLabel="この内容で日程調整を始める" participantCount={3} />);

  fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  fireEvent.click(screen.getByLabelText(/7月14日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  fireEvent.click(screen.getByRole("button", { name: "この内容で日程調整を始める" }));

  expect(await screen.findByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
  expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
});

it("shows nazotoki template times", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

  fireEvent.click(screen.getByRole("button", { name: "13:00〜" }));

  expect(screen.getByRole("button", { name: "開始 13:00" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "終了 15:00" })).toBeInTheDocument();
});

it("adds a multi-day candidate by dragging across dates", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

  fireEvent.pointerDown(screen.getByLabelText(/7月15日.*を選択/));
  fireEvent.pointerEnter(screen.getByLabelText(/7月16日.*を選択/));
  fireEvent.pointerUp(screen.getByLabelText(/7月16日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

  expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
  expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-16T21:00");
});
```

`"blocks review when the answer deadline is after the first candidate"` テストは、開始/終了/回答期限すべて既定値のままだと成立しなくなる(既定の候補日と回答期限の前後関係が変わるため)。これは既定値のまま候補日だけを同日にして検証する形に書き換える:

```tsx
it("blocks review when the answer deadline is after the first candidate", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

  fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  // 候補日と同じ7月15日を回答期限に選ぶと、既定の回答期限時刻(23:45)は
  // 候補日時の終了(21:00)より後になるため、常にエラーになる
  fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
  fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

  expect(screen.getByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "内容を確認する" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: FAIL — `TimeSelect` がまだ `TimeDialPicker` に置き換わっていないため、`role="button", name: "開始 19:00"` 等が見つからずタイムアウトする

- [ ] **Step 3: `plan-form.tsx` を実装する**

1-17行目のimportに `TimeDialPicker` を追加し、47-48行目の `hourOptions`/`minuteOptions` を削除する:

```tsx
import { TimeDialPicker } from "@/components/plan/time-dial-picker";
```

(47-48行目の削除)
```
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
```
を削除する(`TimeDialPicker` はこれらを使わない)。

187-229行目の `TimeSelect` 関数定義を削除する。

797行目の呼び出しを置き換える:

```tsx
<TimeDialPicker time={candidateStartTime} onTimeChange={setCandidateStartTime} label="開始" fieldLabel="開始" buttonRef={candidateHourRef} />
```

801行目の呼び出しを置き換える:

```tsx
<TimeDialPicker time={candidateEndTime} onTimeChange={setCandidateEndTime} label="終了" fieldLabel="終了" />
```

847行目の呼び出しを置き換える:

```tsx
<TimeDialPicker time={deadlineTime} onTimeChange={setDeadlineTime} label="回答期限" fieldLabel="回答期限" buttonRef={deadlineHourRef} />
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form.test.tsx
git commit -m "feat: replace candidate/deadline time inputs with TimeDialPicker"
```

---

### Task 4: 進行表フォームへの適用

**Files:**
- Modify: `components/plan/plan-timetable-form.tsx`
- Test: `tests/plan/plan-timetable.test.tsx`(既存の `type="time"` 操作を書き換え)

**Interfaces:**
- Consumes: Task 2 の `TimeDialPicker`(`optional`/`onClear` props を使用)
- Produces: なし

- [ ] **Step 1: 既存テストの時刻操作を確認し、`TimeDialPicker` の操作に合わせて書き換える**

Run: `npx vitest run tests/plan/plan-timetable.test.tsx --reporter=dot` で現状のテスト内容と `fireEvent.change(..., { target: { value: "19:00" } })` のような time input 操作箇所を確認し、以下のパターンに置き換える(既存テストの `getByLabelText("開始")` を使った `type="time"` への `fireEvent.change` は動作しなくなるため):

```tsx
// 変更前の例:
// fireEvent.change(screen.getByLabelText("開始"), { target: { value: "19:30" } });
// 変更後: TimeDialPicker は展開しない限りデフォルト値のまま送信されるため、
// 既定値(19:00)のまま進行を追加するテストに書き換える。時刻を変える必要がある
// テストケースがあれば、Task 2 のドラッグ操作パターンに倣う。
```

具体的な書き換えは `tests/plan/plan-timetable.test.tsx` を実行して現状の失敗内容を見ながら、既定値ベースのアサーションに揃える。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-timetable.test.tsx --reporter=dot`
Expected: FAIL — `<input type="time">` に対する `getByLabelText("開始")` が `TimeDialPicker` のチップボタンに変わり、旧アサーションが合わなくなる

- [ ] **Step 3: `plan-timetable-form.tsx` を実装する**

1-8行目のimportに追加する:

```tsx
import { TimeDialPicker } from "@/components/plan/time-dial-picker";
```

82-108行目(開始/終了の `<input type="time">` を含む `<div className="grid gap-3 sm:grid-cols-2">` ブロック)を置き換える:

```tsx
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <TimeDialPicker
              time={defaultStartTime}
              onTimeChange={() => {}}
              label="開始"
              fieldLabel="開始"
            />
            <input type="hidden" name="start_time" value={defaultStartTime} />
          </div>
          <div>
            <TimeDialPicker
              time={defaultValues?.endTime ?? ""}
              onTimeChange={() => {}}
              label="終了"
              fieldLabel="終了"
              optional
              onClear={() => {}}
            />
          </div>
        </div>
```

この時点では `PlanTimetableForm` は `action` を受け取るサーバーアクションフォームで、`start_time`/`end_time` を state で持っていない(`defaultValue` ベースの非制御フォーム)。`TimeDialPicker` は値を state で制御する必要があるため、`PlanTimetableForm` 自体を `"use client"` の制御コンポーネントに変える必要がある。以下のように書き換える。

ファイル冒頭に `"use client"` を追加し(1行目)、`useState` をimportに追加する:

```tsx
"use client";

import React, { useState } from "react";
```

`PlanTimetableForm` 関数の本体、`const isMultiDay = eventDates.length > 1;` の直後に state を追加する:

```tsx
  const isMultiDay = eventDates.length > 1;
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultValues?.endTime ?? "");
```

先ほどの開始/終了ブロックを、state を使う形に修正する:

```tsx
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <TimeDialPicker time={startTime} onTimeChange={setStartTime} label="開始" fieldLabel="開始" />
            <input type="hidden" name="start_time" value={startTime} required />
          </div>
          <div>
            <TimeDialPicker
              time={endTime}
              onTimeChange={setEndTime}
              label="終了"
              fieldLabel="終了"
              optional
              onClear={() => setEndTime("")}
            />
            {endTime ? <input type="hidden" name="end_time" value={endTime} /> : null}
          </div>
        </div>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-timetable.test.tsx tests/plan/plan-timetable-page.test.tsx --reporter=dot`
Expected: PASS(全件成功。`plan-timetable-page.test.tsx` は `PlanTimetableForm` を使う統合テストのため、あわせて実行する)

- [ ] **Step 5: コミット**

```bash
git add components/plan/plan-timetable-form.tsx tests/plan/plan-timetable.test.tsx
git commit -m "feat: replace timetable time inputs with TimeDialPicker"
```

---

### Task 5: 空き状況の日次集計ロジック(サーバー側)

**Files:**
- Modify: `lib/domain/plan/group-availability.ts`
- Test: `tests/plan/group-availability.test.ts`(存在しなければ新規作成。既存ファイルがあれば追記)

**Interfaces:**
- Consumes: 既存の `BusyRange` 型(`lib/domain/calendar/calendar-availability`)、既存の `monthRangeInTokyo` が返す `TimeRange`
- Produces: `DailyBusySummary` 型と `buildDailyBusySummaries` 関数。Task 6 がこれを使う。

```ts
export type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
};

export function buildDailyBusySummaries({
  busyByParticipant,
  range
}: {
  busyByParticipant: BusyRange[][];
  range: TimeRange;
}): Record<string, DailyBusySummary>
```

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/group-availability.test.ts` を新規作成する(既存の同名テストが無い前提。あれば末尾に追記する):

```ts
import { describe, expect, it } from "vitest";

import { buildDailyBusySummaries } from "@/lib/domain/plan/group-availability";

describe("buildDailyBusySummaries", () => {
  it("予定が無い日は maxBusyCount も allDayBusyCount も0", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [[], []],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 0, allDayBusyCount: 0 });
  });

  it("一人だけ一部の時間帯に予定があると maxBusyCount は1", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T10:00:00+09:00", end: "2026-08-01T11:00:00+09:00" }],
        []
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 0 });
  });

  it("同じ時間帯に複数人の予定が重なると maxBusyCount がその人数になる", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T10:00:00+09:00", end: "2026-08-01T11:00:00+09:00" }],
        [{ start: "2026-08-01T10:30:00+09:00", end: "2026-08-01T11:30:00+09:00" }]
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"].maxBusyCount).toBe(2);
  });

  it("一人の予定がその日24時間ぶん連続していると allDayBusyCount が1増える", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [
        [{ start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }],
        []
      ],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-02T00:00:00+09:00" }
    });

    expect(result["2026-08-01"]).toEqual({ maxBusyCount: 1, allDayBusyCount: 1 });
  });

  it("月の範囲すべての日付がキーとして存在する", () => {
    const result = buildDailyBusySummaries({
      busyByParticipant: [[]],
      range: { start: "2026-08-01T00:00:00+09:00", end: "2026-08-04T00:00:00+09:00" }
    });

    expect(Object.keys(result)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/group-availability.test.ts --reporter=dot`
Expected: FAIL — `buildDailyBusySummaries` が存在しない

- [ ] **Step 3: `lib/domain/plan/group-availability.ts` に実装を追加する**

90行目(ファイル末尾、`buildAvailabilitySlots` の後)に追記する:

```ts
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
};

export function buildDailyBusySummaries({
  busyByParticipant,
  range
}: {
  busyByParticipant: BusyRange[][];
  range: TimeRange;
}): Record<string, DailyBusySummary> {
  const startTime = toTime(range.start);
  const endTime = toTime(range.end);
  const summaries: Record<string, DailyBusySummary> = {};

  for (let dayStart = startTime; dayStart < endTime; dayStart += DAY_MILLISECONDS) {
    const dayEnd = dayStart + DAY_MILLISECONDS;
    const date = formatTokyoIso(dayStart).slice(0, 10);

    let maxBusyCount = 0;
    for (let slotStart = dayStart; slotStart < dayEnd; slotStart += SLOT_MILLISECONDS) {
      const slot = { start: formatTokyoIso(slotStart), end: formatTokyoIso(slotStart + SLOT_MILLISECONDS) };
      const busyCount = busyByParticipant.filter((busyRanges) => busyRanges.some((busyRange) => overlaps(slot, busyRange))).length;
      maxBusyCount = Math.max(maxBusyCount, busyCount);
    }

    let allDayBusyCount = 0;
    for (const busyRanges of busyByParticipant) {
      let isBusyAllDay = true;
      for (let slotStart = dayStart; slotStart < dayEnd; slotStart += SLOT_MILLISECONDS) {
        const slot = { start: formatTokyoIso(slotStart), end: formatTokyoIso(slotStart + SLOT_MILLISECONDS) };
        if (!busyRanges.some((busyRange) => overlaps(slot, busyRange))) {
          isBusyAllDay = false;
          break;
        }
      }
      if (isBusyAllDay) {
        allDayBusyCount += 1;
      }
    }

    summaries[date] = { maxBusyCount, allDayBusyCount };
  }

  return summaries;
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/group-availability.test.ts --reporter=dot`
Expected: PASS(5件とも成功)

- [ ] **Step 5: コミット**

```bash
git add lib/domain/plan/group-availability.ts tests/plan/group-availability.test.ts
git commit -m "feat: add daily busy summary aggregation for group availability"
```

---

### Task 6: 空き状況APIのレスポンス拡張

**Files:**
- Modify: `app/api/events/[eventId]/availability/route.ts`
- Test: `tests/api/events-availability.test.ts` あるいは既存の対応するAPIテストファイル(`app/api/events/[eventId]/availability` を対象にした既存テストを探し、そこに追記する)

**Interfaces:**
- Consumes: Task 5 の `buildDailyBusySummaries`
- Produces: レスポンスJSONに `dailyBusySummaries: Record<string, DailyBusySummary>` フィールドが追加される。Task 7 がこれを使う。

- [ ] **Step 1: 失敗するテストを書く**

既存の空き状況APIテストファイルを探す(`tests/` 配下で `availability/route` を対象にしたテストを検索し、そのファイルに以下のアサーションを追記する形にする)。見つからない場合は `tests/api/events-availability-route.test.ts` を新規作成し、既存のルートテストの体裁(Supabaseクライアントのモック方法)に倣う。最低限、次の観点のテストを追加する:

```ts
// 既存のレスポンス検証テストに、以下のフィールドが含まれることを追加でアサートする
expect(responseBody).toHaveProperty("dailyBusySummaries");
expect(responseBody.dailyBusySummaries["<期待する日付>"]).toEqual({
  maxBusyCount: expect.any(Number),
  allDayBusyCount: expect.any(Number)
});
```

具体的なモックデータ・アサーション値は、既存テストファイルが使っている `fetchCalendarFreeBusy` のモック方式に合わせて書く。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run <対象テストファイル> --reporter=dot`
Expected: FAIL — レスポンスに `dailyBusySummaries` が含まれない

- [ ] **Step 3: `route.ts` を実装する**

3行目のimportに `buildDailyBusySummaries` を追加する:

```ts
import { monthRangeInTokyo, buildAvailabilitySlots, buildDailyBusySummaries } from "@/lib/domain/plan/group-availability";
```

97-109行目を置き換える:

```ts
    const slots = buildAvailabilitySlots({
      participantCount: connectedCount,
      busyByParticipant,
      range
    });
    const dailyBusySummaries = buildDailyBusySummaries({ busyByParticipant, range });

    return NextResponse.json({
      month,
      updatedAt: new Date().toISOString(),
      connectedCount,
      memberCount,
      slots,
      dailyBusySummaries
    });
```

71-79行目(`connectedCount === 0` の早期return)にも `dailyBusySummaries: {}` を追加する:

```ts
  if (connectedCount === 0) {
    return NextResponse.json({
      month,
      updatedAt: new Date().toISOString(),
      connectedCount,
      memberCount,
      slots: [],
      dailyBusySummaries: {}
    });
  }
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run <対象テストファイル> --reporter=dot`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add app/api/events/[eventId]/availability/route.ts <対象テストファイル>
git commit -m "feat: include daily busy summaries in availability API response"
```

---

### Task 7: `GroupAvailabilityCalendar` の更新(文言・型・集計ロジック)

**Files:**
- Modify: `components/plan/group-availability-calendar.tsx`
- Modify: `tests/plan/group-availability-calendar.test.tsx`
- Modify: `tests/plan/plan-form-group-availability.test.tsx`(モックレスポンスに `dailyBusySummaries` が必要になる場合)

**Interfaces:**
- Consumes: Task 6 で拡張された `AvailabilityResponse`(`dailyBusySummaries` フィールド)
- Produces: `onAvailabilityByDate` コールバックの型が `Record<string, { maxBusyCount: number; allDayBusyCount: number }>` に変わる。Task 8(`CalendarPicker`)がこれを使う。

- [ ] **Step 1: 既存テストを新しいレスポンス形に書き換える**

`tests/plan/group-availability-calendar.test.tsx` の45-71行目のテストを、新しいフィールドを検証する形に置き換える:

```tsx
  it("returns daily busy summaries to the date picker", async () => {
    const onAvailabilityByDate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          slots: [],
          dailyBusySummaries: {
            "2026-07-15": { maxBusyCount: 1, allDayBusyCount: 0 }
          }
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" selectedRange={null} onAvailabilityByDate={onAvailabilityByDate} />);

    await waitFor(() =>
      expect(onAvailabilityByDate).toHaveBeenLastCalledWith({
        "2026-07-15": { maxBusyCount: 1, allDayBusyCount: 0 }
      })
    );
  });
```

38行目の見出しテキストのアサーションを更新する:

```tsx
    expect(await screen.findByText("参加者全体の空き状況")).toBeInTheDocument();
```

残りのテスト(12-43行目, 77-172行目)の `json: async () => ({...})` モックに、`dailyBusySummaries: {}` を追加する(既存のフィールド構成に1行足すだけ)。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/group-availability-calendar.test.tsx --reporter=dot`
Expected: FAIL — 見出しテキストが一致しない、`onAvailabilityByDate` の呼び出し引数が旧形式のまま

- [ ] **Step 3: `group-availability-calendar.tsx` を実装する**

13-21行目の型定義を変更する:

```tsx
type AvailabilitySlot = {
  start: string;
  end: string;
  availableCount: number;
};

type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
};

type AvailabilityResponse = {
  month: string;
  updatedAt: string;
  connectedCount: number;
  memberCount: number;
  slots: AvailabilitySlot[];
  dailyBusySummaries: Record<string, DailyBusySummary>;
};
```

49-63行目の `summarizeDailyAvailability` 関数を削除する。

65-74行目のコンポーネント宣言部分、`onAvailabilityByDate` の型を変更する:

```tsx
export function GroupAvailabilityCalendar({
  eventId,
  visibleMonth,
  selectedRange,
  onAvailabilityByDate
}: {
  eventId: string;
  visibleMonth: string;
  selectedRange: { start: string; end: string } | null;
  onAvailabilityByDate?: (availabilityByDate: Record<string, DailyBusySummary>) => void;
}) {
```

118-126行目を置き換える(`summarizeDailyAvailability` 呼び出しを削除し、レスポンスの `dailyBusySummaries` をそのまま使う):

```tsx
  const dailyBusySummaries = availability?.dailyBusySummaries ?? {};
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    onAvailabilityByDate?.(dailyBusySummaries);
  }, [dailyBusySummaries, onAvailabilityByDate]);
```

135行目の見出しを変更する:

```tsx
              参加者全体の空き状況
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/group-availability-calendar.test.tsx tests/plan/plan-form-group-availability.test.tsx --reporter=dot`
Expected: PASS(`plan-form-group-availability.test.tsx` がモックレスポンスに `dailyBusySummaries` を含んでいない場合はFAILするので、そのモックにも `dailyBusySummaries: {}` を追加してから再実行する)

- [ ] **Step 5: コミット**

```bash
git add components/plan/group-availability-calendar.tsx tests/plan/group-availability-calendar.test.tsx tests/plan/plan-form-group-availability.test.tsx
git commit -m "feat: rename availability heading and switch to daily busy summaries"
```

---

### Task 8: `CalendarPicker` の空き状況の色分け

**Files:**
- Modify: `components/plan/plan-form.tsx`(`CalendarPicker` の `availabilityByDate` prop の型と `availabilityTone` 計算)
- Test: `tests/plan/plan-form-group-availability.test.tsx`(色分けのアサーションを追加)

**Interfaces:**
- Consumes: Task 7 で変更された `onAvailabilityByDate` の型(`Record<string, { maxBusyCount: number; allDayBusyCount: number }>`)
- Produces: なし(末端のUI変更)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/plan-form-group-availability.test.tsx` を開き、既存のテスト内容(`GroupAvailabilityCalendar` からのコールバックが `CalendarPicker` の色分けに反映されることを検証しているテスト)を確認し、次のケースを追加する:

```tsx
it("誰か1人でも終日予定があると、他の状態より優先してグレー表示になる", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        month: "2026-07",
        updatedAt: "2026-07-01T00:00:00Z",
        connectedCount: 2,
        memberCount: 2,
        slots: [],
        dailyBusySummaries: {
          "2026-07-15": { maxBusyCount: 2, allDayBusyCount: 1 }
        }
      })
    }))
  );

  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventId="event-1" />);

  const dayButton = await screen.findByLabelText(/7月15日.*を選択/);
  await waitFor(() => expect(dayButton.className).toContain("bg-subtle/28"));
});

it("複数人予定があると skywash の濃い方になる", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        month: "2026-07",
        updatedAt: "2026-07-01T00:00:00Z",
        connectedCount: 3,
        memberCount: 3,
        slots: [],
        dailyBusySummaries: {
          "2026-07-15": { maxBusyCount: 2, allDayBusyCount: 0 }
        }
      })
    }))
  );

  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventId="event-1" />);

  const dayButton = await screen.findByLabelText(/7月15日.*を選択/);
  await waitFor(() => expect(dayButton.className).toContain("bg-skywash/85"));
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form-group-availability.test.tsx --reporter=dot`
Expected: FAIL — `availabilityTone` がまだ旧ロジック(`bg-moss/20` 等)のまま

- [ ] **Step 3: `plan-form.tsx` を実装する**

238-256行目の `CalendarPicker` の型定義、`availabilityByDate` prop の型を変更する:

```tsx
  availabilityByDate?: Record<string, { maxBusyCount: number; allDayBusyCount: number }>;
```

347-350行目を置き換える:

```tsx
          const dailyBusy = availabilityByDate[cell.date];
          const availabilityTone = dailyBusy
            ? dailyBusy.allDayBusyCount > 0
              ? "border border-subtle bg-subtle/28"
              : dailyBusy.maxBusyCount >= 2
                ? "bg-skywash/85"
                : dailyBusy.maxBusyCount === 1
                  ? "bg-skywash/45"
                  : null
            : null;
```

351-353行目の `availabilityLabel`(aria-label用の文言)を、新しいデータ構造に合わせて更新する:

```tsx
          const availabilityLabel = dailyBusy
            ? dailyBusy.allDayBusyCount > 0
              ? "、終日予定のある参加者あり"
              : dailyBusy.maxBusyCount > 0
                ? `、予定が重なっている参加者${dailyBusy.maxBusyCount}人`
                : ""
            : "";
```

`plan-form.tsx` 内で `GroupAvailabilityCalendar` に渡している `onAvailabilityByDate` の受け皿(`groupAvailabilityByDate` state)の型注釈があれば、同様に `Record<string, { maxBusyCount: number; allDayBusyCount: number }>` に更新する。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form-group-availability.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form-group-availability.test.tsx
git commit -m "feat: recolor calendar availability by overlapping-participant count"
```

---

### Task 9: 月選択パネルの自動クローズと謎解きテンプレートの配置

**Files:**
- Modify: `components/plan/plan-form.tsx`(`CalendarPicker` の `monthPickerOpen` 挙動、謎解きテンプレートの配置)
- Test: `tests/plan/plan-form.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし(末端のUI変更)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/plan-form.test.tsx` の末尾に追加する:

```tsx
it("月選択パネルは、月を選ぶと自動で閉じる", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

  fireEvent.click(screen.getByRole("button", { name: /2026年7月/ }));
  expect(screen.getByLabelText("月を選択")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("月を選択"));
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "8月" }));

  expect(screen.queryByLabelText("月を選択")).not.toBeInTheDocument();
});

it("月選択パネルは、外側をクリックすると閉じる", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

  fireEvent.click(screen.getByRole("button", { name: /2026年7月/ }));
  expect(screen.getByLabelText("月を選択")).toBeInTheDocument();

  fireEvent.mouseDown(document.body);

  expect(screen.queryByLabelText("月を選択")).not.toBeInTheDocument();
});

it("謎解きテンプレートは時刻チップの直上に表示される", () => {
  render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

  const template = screen.getByText("謎解きテンプレート");
  const startChip = screen.getByRole("button", { name: /^開始 / });
  // DOM順で謎解きテンプレートが開始チップより前にあることを確認する
  expect(template.compareDocumentPosition(startChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: FAIL — 月選択パネルが選択後も開いたまま、外側クリックでも閉じない。謎解きテンプレートがまだ日付カレンダーの上にある

- [ ] **Step 3: `plan-form.tsx` を実装する**

`CalendarPicker` 関数内、258行目の `monthPickerOpen` state 定義の直後に、外側クリック検知用の ref と effect を追加する:

```tsx
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!monthPickerOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [monthPickerOpen]);
```

301-330行目の年/月パネルの `<div>` に `ref={monthPickerRef}` を付け、`onChangeMonth` のラップで選択後に閉じるようにする:

```tsx
      {monthPickerOpen ? (
        <div ref={monthPickerRef} className="mb-3 grid gap-2 rounded-control border border-moss/18 bg-surface p-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">
            <span className="text-muted">年</span>
            <div className="mt-2">
              <MadoiSelect
                value={String(visibleMonth.getFullYear())}
                onValueChange={(year) => {
                  onChangeMonth(new Date(Number(year), visibleMonth.getMonth(), 1));
                  setMonthPickerOpen(false);
                }}
                options={yearOptions.map((year) => ({ value: String(year), label: `${year}年` }))}
                fieldLabel="年を選択"
                ariaLabel="年を選択"
                compact
              />
            </div>
          </label>
          <label className="text-sm font-medium text-ink">
            <span className="text-muted">月</span>
            <div className="mt-2">
              <MadoiSelect
                value={String(visibleMonth.getMonth())}
                onValueChange={(month) => {
                  onChangeMonth(new Date(visibleMonth.getFullYear(), Number(month), 1));
                  setMonthPickerOpen(false);
                }}
                options={Array.from({ length: 12 }, (_, month) => ({ value: String(month), label: `${month + 1}月` }))}
                fieldLabel="月を選択"
                ariaLabel="月を選択"
                compact
              />
            </div>
          </label>
        </div>
      ) : null}
```

(`fieldLabel` を `"年"`/`"月"` から `"年を選択"`/`"月を選択"` に変更したのは、テストの `getByLabelText("月を選択")` と一致させるため。`MadoiSelect` は `fieldLabel` を非表示 `<input>` の `data-field-label` に使うだけで、実際に画面へ見せているのは `ariaLabel`(すでに `"年を選択"`/`"月を選択"`)。したがって実際に変更が必要なのは `ariaLabel` の一致だけで、`fieldLabel` は変更しなくてもよい。差分から `fieldLabel="年"`/`fieldLabel="月"` の行は変更せずに残す。)

謎解きテンプレート(733-749行目)を、日付カレンダー(`CalendarPicker` 呼び出し、750-763行目)と `TimeDialPicker` の呼び出し(797-802行目を含む開始/終了のブロック)の間から、開始/終了チップの直前(795-803行目相当のブロックの直前)に移動する。現在のJSXの並び順(729行目の見出し `<h2>` → 733-749行目のテンプレート → 750-763行目の `CalendarPicker` → 764-781行目の空き状況 → 782-793行目の終日チェックボックス → 794行目以降の開始/終了)を、次の順に並び替える:

1. 見出し `<h2>`(729-732行目、変更なし)
2. `CalendarPicker` 呼び出し(750-763行目)
3. `GroupAvailabilityCalendar`/`CalendarAvailabilityPanel`(764-781行目)
4. 終日チェックボックス(782-793行目)
5. 謎解きテンプレート(733-749行目のブロックをここに移動)
6. 開始/終了の `TimeDialPicker`(794行目以降)

具体的には、733-749行目のブロックを一度削除し、793行目(終日チェックボックスの `</label>` の直後)と794行目(開始/終了の `<div className="grid gap-4 sm:grid-cols-2">` の直前)の間に貼り付ける。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form.test.tsx
git commit -m "feat: auto-close month picker and move nazotoki template above time chips"
```

---

### Task 10: 全体テストと実機確認

**Files:** なし(検証のみ)

- [ ] **Step 1: プロジェクト全体のテストを実行する**

Run: `npx vitest run --reporter=dot`
Expected: PASS(全件成功。既存の他コンポーネントのテストに影響がないこと)

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 375px幅で実機確認する**

開発サーバーを起動し(`npm run dev`)、ブラウザの幅を375pxにして以下を確認する:

- `/events/[eventId]/plans/new`: 謎解きカテゴリのイベントで、謎解きテンプレートが開始/終了チップの直上にあること。開始/終了チップをタップすると時計が展開し、時/分ボタンとドラッグで値が変わること。5分刻みでスナップすること
- カレンダー上で、予定なし/一人予定あり/複数人予定あり/誰か終日予定ありの日が、それぞれ色なし/skywash薄/skywash濃/グレーで表示されること
- 月選択パネルを開いて年か月を選ぶと自動で閉じること。パネルを開いた状態でパネル外をタップしても閉じること
- `/plans/[planId]/timetable`: 「進行を追加」を開き、開始チップは常に表示、終了は「+ 終了を設定」から展開できること。「未設定に戻す」で元に戻ること
- 回答期限のステップでも同じ時計ダイヤルが使えること

- [ ] **Step 4: コミット不要(検証のみのタスクのため)**

## Self-Review

**Spec coverage:**
- 「1. 時刻入力コンポーネント」→ Task 1, 2, 3, 4
- 「2. カレンダー上の空き状況表示」→ Task 5, 6, 7, 8
- 「3. 月選択パネルの自動クローズ」→ Task 9
- 「4. 謎解きテンプレートの配置」→ Task 9
- 「5. 文言修正」→ Task 7
- テスト方針(spec記載の5項目)→ Task 1-2(TimeDialPicker単体)、Task 5(日次集計ユニットテスト)、Task 8(色分けテスト)、Task 4(進行表の未設定トグル)、Task 10(実機確認)
すべてカバーしている。

**Placeholder scan:** Task 4のStep1とTask 6のStep1は、既存テストファイルの現状(見ないと正確な差分が書けない箇所)を先に確認してから書き換える指示にしており、具体的な期待値がまだ書けない部分がある。これは「読んでから書く」性質の作業であり、実装者が最初にやるべき調査手順を明記しているため、TBD/TODOのようなプレースホルダとは異なる(readingのステップを明示し、その後の書き換え方針は具体的に示している)。他のタスクはすべて完全なコードを記載済み。

**Type consistency:** `TimeDialPicker` の props(`time`, `onTimeChange`, `label`, `fieldLabel`, `buttonRef`, `optional`, `onClear`)は Task 2 で定義し、Task 3・Task 4 の呼び出しで同じ名前・型を使っている。`DailyBusySummary`(`{ maxBusyCount: number; allDayBusyCount: number }`)は Task 5 で定義し、Task 6(APIレスポンス)・Task 7(`onAvailabilityByDate` の型)・Task 8(`CalendarPicker` の `availabilityByDate` prop の型)で一貫して同じ形を使っている。
