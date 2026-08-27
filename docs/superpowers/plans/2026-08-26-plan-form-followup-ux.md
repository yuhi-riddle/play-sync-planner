# Plan Form Follow-up UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn candidate-date selection into one tap-to-expand interaction with an anonymized hourly availability breakdown, rebuild the time dial's "hour" mode as a dual-ring picker (outer=1〜12, inner=13〜23・00), remove the nazotoki quick-template feature, and give the candidate list numbered badges.

**Architecture:** Domain-layer pure functions (dual-ring angle/radius math, per-day hourly busy segments) get built and tested first, bottom-up. `GroupAvailabilityCalendar`'s role shrinks to header/connection-status only; a new small presentational component renders the hourly bar; `CalendarPicker` (inside `plan-form.tsx`) gains a generic render-prop slot for an "expanded date panel" so it stays unaware of what that panel contains; `PlanForm` supplies the panel content (breakdown bar + all-day + time dial + add button) using state it already owns.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- 新しい色トークンは追加しない。時間帯内訳バーは既存の `skywash`(45%/85%)のみで表現する(design/tokens.css・tailwind.config.tsに定義済みの値のみ使う)。
- 時計ダイヤルの二重リングは、数字の表示位置・タップ判定の境界・針の長さを同じ半径定数で揃える(位置と判定がズレるとバグの元になる、ブレインストーミング中に実際に発生した不具合)。
- タップ/ドラッグの角度→時刻変換ロジック自体(1周=24時間、5分刻み)は変えない。変わるのは「時」モードの半径判定だけ。
- 個別の予定内容(名前・場所・誰が)は一切表示しない。時間帯内訳は「何人重なっているか」の匿名集計のみ。
- テストは `npx vitest run <path> --reporter=dot` で実行する。

---

### Task 1: 時計ダイヤル 二重リングの角度⇔時刻変換ロジック(純粋関数)

**Files:**
- Modify: `lib/domain/plan/time-dial.ts`
- Test: `tests/plan/time-dial.test.ts`

**Interfaces:**
- Consumes: なし(既存の `pointForAngleDeg`/`clientPointToAngleDeg`/`TIME_DIAL_CENTER` をそのまま使う)
- Produces:
  - `TIME_DIAL_OUTER_RADIUS = 60`, `TIME_DIAL_INNER_RADIUS = 34`, `TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS = 47`
  - `hourAngleDeg(hour: number): number`
  - `hourIsOuterRing(hour: number): boolean`
  - `angleAndRadiusToHour(angleDeg: number, radius: number): number`
  - `type HourDialPosition = { angleDeg: number; outerValue: number; innerValue: number; innerAlwaysVisible: boolean }`
  - `buildHourDialPositions(): HourDialPosition[]`(12件)
  - `angleToMinutes(angleDeg: number, radius: number, mode: TimeDialMode, currentMinutes: number): number`(**シグネチャ変更**: `radius` 引数が増える。分モードでは無視される)
  - `handPointForMinutes(minutes: number, mode: TimeDialMode): DialPoint`(時モードの実装のみ変更、シグネチャは同じ)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/time-dial.test.ts` を開き、29-42行目・59-67行目のテストを次で置き換える(他のテストはそのまま残す):

```ts
  it("外側リング(1〜12)は輪の縁寄り、内側リング(13〜23・00)は中心寄りをタップ/ドラッグしたときに選ばれる", () => {
    // 90度は「3時/15時」の位置。輪の縁寄り(半径60、境界47より外)なら3時。
    expect(angleToMinutes(90, TIME_DIAL_OUTER_RADIUS, "hour", 19 * 60 + 30)).toBe(3 * 60 + 30);
    // 中心寄り(半径34、境界47より内)なら15時。
    expect(angleToMinutes(90, TIME_DIAL_INNER_RADIUS, "hour", 19 * 60 + 30)).toBe(15 * 60 + 30);
    // 0度(12時位置)の外側は12時、内側は00時。
    expect(angleToMinutes(0, TIME_DIAL_OUTER_RADIUS, "hour", 19 * 60 + 30)).toBe(12 * 60 + 30);
    expect(angleToMinutes(0, TIME_DIAL_INNER_RADIUS, "hour", 19 * 60 + 30)).toBe(0 * 60 + 30);
  });

  it("converts a drag angle to a minute, snapping to 5-minute steps and keeping the current hour", () => {
    expect(TIME_DIAL_STEP_MINUTES).toBe(5);
    // 分モードでは半径は無視される。
    expect(angleToMinutes(23, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 5);
    expect(angleToMinutes(0, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 0);
    expect(angleToMinutes(180, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 30);
  });
```

```ts
  it("computes the hand point for hour and minute modes", () => {
    // 6時は外側リング、角度は(6%12/12)*360=180度。
    const hourHandOuter = handPointForMinutes(6 * 60, "hour");
    expect(hourHandOuter.x).toBeCloseTo(90, 0);
    expect(hourHandOuter.y).toBeCloseTo(90 + TIME_DIAL_OUTER_RADIUS, 0);

    // 15時は内側リング、角度は(3/12)*360=90度。
    const hourHandInner = handPointForMinutes(15 * 60, "hour");
    expect(hourHandInner.x).toBeCloseTo(90 + TIME_DIAL_INNER_RADIUS, 0);
    expect(hourHandInner.y).toBeCloseTo(90, 0);

    const minuteHand = handPointForMinutes(19 * 60 + 30, "minute");
    expect(minuteHand.x).toBeCloseTo(90, 0);
    expect(minuteHand.y).toBeCloseTo(90 + 68, 0);
  });
```

`import` 文に `TIME_DIAL_OUTER_RADIUS`, `TIME_DIAL_INNER_RADIUS` を追加する:

```ts
import {
  TIME_DIAL_STEP_MINUTES,
  TIME_DIAL_OUTER_RADIUS,
  TIME_DIAL_INNER_RADIUS,
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  pointForAngleDeg
} from "@/lib/domain/plan/time-dial";
```

ファイル末尾の `describe` ブロックの中、既存テストの後に追加する:

```ts
  it("hourAngleDeg maps 1〜12時と13〜23・00時を12方向・同じ角度に対応させる", () => {
    expect(hourAngleDeg(12)).toBeCloseTo(0);
    expect(hourAngleDeg(0)).toBeCloseTo(0);
    expect(hourAngleDeg(3)).toBeCloseTo(90);
    expect(hourAngleDeg(15)).toBeCloseTo(90);
    expect(hourAngleDeg(9)).toBeCloseTo(270);
    expect(hourAngleDeg(21)).toBeCloseTo(270);
  });

  it("hourIsOuterRing は1〜12時だけtrueを返す", () => {
    expect(hourIsOuterRing(1)).toBe(true);
    expect(hourIsOuterRing(12)).toBe(true);
    expect(hourIsOuterRing(0)).toBe(false);
    expect(hourIsOuterRing(13)).toBe(false);
    expect(hourIsOuterRing(23)).toBe(false);
  });

  it("angleAndRadiusToHour は角度と半径の組み合わせで0〜23時を一意に返す", () => {
    expect(angleAndRadiusToHour(0, TIME_DIAL_OUTER_RADIUS)).toBe(12);
    expect(angleAndRadiusToHour(0, TIME_DIAL_INNER_RADIUS)).toBe(0);
    expect(angleAndRadiusToHour(330, TIME_DIAL_OUTER_RADIUS)).toBe(11);
    expect(angleAndRadiusToHour(330, TIME_DIAL_INNER_RADIUS)).toBe(23);
    // 境界ちょうどは外側扱い(> ではなく >= でないことを明示するテスト)
    expect(angleAndRadiusToHour(90, TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS)).toBe(15);
    expect(angleAndRadiusToHour(90, TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS + 0.01)).toBe(3);
  });

  it("buildHourDialPositions は12方向ぶんの外側/内側の値と、内側の常時表示フラグを返す", () => {
    const positions = buildHourDialPositions();
    expect(positions).toHaveLength(12);
    expect(positions[0]).toEqual({ angleDeg: 0, outerValue: 12, innerValue: 0, innerAlwaysVisible: true });
    expect(positions[1]).toEqual({ angleDeg: 30, outerValue: 1, innerValue: 13, innerAlwaysVisible: false });
    expect(positions[3]).toEqual({ angleDeg: 90, outerValue: 3, innerValue: 15, innerAlwaysVisible: true });
    expect(positions[9]).toEqual({ angleDeg: 270, outerValue: 9, innerValue: 21, innerAlwaysVisible: true });
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/time-dial.test.ts --reporter=dot`
Expected: FAIL(`angleToMinutes` は3引数のまま、`hourAngleDeg`/`hourIsOuterRing`/`angleAndRadiusToHour`/`buildHourDialPositions`/`TIME_DIAL_OUTER_RADIUS`/`TIME_DIAL_INNER_RADIUS`/`TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS` が存在しない)

- [ ] **Step 3: `lib/domain/plan/time-dial.ts` を実装する**

`TIME_DIAL_RADIUS` の定義の直後に定数を追加する:

```ts
export const TIME_DIAL_RADIUS = 72;
export const TIME_DIAL_OUTER_RADIUS = 60;
export const TIME_DIAL_INNER_RADIUS = 34;
export const TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS = (TIME_DIAL_OUTER_RADIUS + TIME_DIAL_INNER_RADIUS) / 2;
```

`angleToMinutes` を次で置き換える(シグネチャに `radius` を追加、時モードの分岐を二重リング判定に差し替える):

```ts
export function angleToMinutes(angleDeg: number, radius: number, mode: TimeDialMode, currentMinutes: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;

  if (mode === "hour") {
    const hour = angleAndRadiusToHour(normalizedAngle, radius);
    return hour * 60 + (currentMinutes % 60);
  }

  const minute = (Math.round((normalizedAngle / 360) * 60 / TIME_DIAL_STEP_MINUTES) * TIME_DIAL_STEP_MINUTES) % 60;
  return Math.floor(currentMinutes / 60) * 60 + minute;
}

/**
 * 「時」モードの二重リング判定。12方向(30度刻み)のうちどこに一番近いかを角度から求め、
 * 中心からの距離が境界半径より外なら外側の値(1〜12)、内なら内側の値(13〜23・00)を返す。
 */
export function angleAndRadiusToHour(angleDeg: number, radius: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const i = Math.round(normalizedAngle / 30) % 12;
  const base = i === 0 ? 12 : i;
  const isOuter = radius > TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS;
  if (isOuter) {
    return base;
  }
  return base === 12 ? 0 : base + 12;
}

/** ある時刻(0〜23時)が、外側リング(1〜12)と内側リング(13〜23・00)のどちらに属するか。 */
export function hourIsOuterRing(hour: number): boolean {
  return hour >= 1 && hour <= 12;
}

/** ある時刻(0〜23時)を、対応する12方向の角度(度)に変換する。1時と13時は同じ角度になる。 */
export function hourAngleDeg(hour: number): number {
  const i = hour % 12;
  return (i / 12) * 360;
}

export type HourDialPosition = {
  angleDeg: number;
  outerValue: number;
  innerValue: number;
  /** false の位置は、選択されているときだけ内側の数字を表示する(常時表示すると窮屈になるため)。 */
  innerAlwaysVisible: boolean;
};

const HOUR_DIAL_INNER_MAJOR_POSITIONS = new Set([0, 3, 6, 9]);

/** 12方向ぶんの外側/内側の値のペアを返す。数字の配置・常時表示するかどうかの判定に使う。 */
export function buildHourDialPositions(): HourDialPosition[] {
  const positions: HourDialPosition[] = [];
  for (let i = 0; i < 12; i++) {
    positions.push({
      angleDeg: (i / 12) * 360,
      outerValue: i === 0 ? 12 : i,
      innerValue: i === 0 ? 0 : i + 12,
      innerAlwaysVisible: HOUR_DIAL_INNER_MAJOR_POSITIONS.has(i)
    });
  }
  return positions;
}
```

`handPointForMinutes` の「時」モードの分岐を次で置き換える:

```ts
export function handPointForMinutes(minutes: number, mode: TimeDialMode): DialPoint {
  if (mode === "hour") {
    const hour = Math.floor(minutes / 60);
    const radius = hourIsOuterRing(hour) ? TIME_DIAL_OUTER_RADIUS : TIME_DIAL_INNER_RADIUS;
    return pointForAngleDeg(hourAngleDeg(hour), radius);
  }
  const minute = minutes % 60;
  return pointForAngleDeg((minute / 60) * 360, TIME_DIAL_RADIUS - 4);
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/time-dial.test.ts --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: `components/plan/time-dial-picker.tsx` で `angleToMinutes` の引数不足エラーが出る(Task 2で直す。ここでは time-dial.ts 自体にエラーが無いことだけ確認する)

- [ ] **Step 6: コミット**

```bash
git add lib/domain/plan/time-dial.ts tests/plan/time-dial.test.ts
git commit -m "feat: add dual-ring hour geometry to time-dial domain functions"
```

---

### Task 2: TimeDialPicker を二重リング表示・タップジャンプ対応にする

**Files:**
- Modify: `components/plan/time-dial-picker.tsx`
- Test: `tests/plan/time-dial-picker.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `angleToMinutes(angleDeg, radius, mode, currentMinutes)`、`buildHourDialPositions()`、`TIME_DIAL_OUTER_RADIUS`、`TIME_DIAL_INNER_RADIUS`
- Produces: `TimeDialPicker` の props は変更しない(`time`/`onTimeChange`/`label`/`fieldLabel`/`buttonRef`/`optional`/`onClear`)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/time-dial-picker.test.tsx` の40-57行目(「ハンドルをドラッグすると時刻が変わる（時モード）」)を次で置き換える:

```tsx
  it("輪をタップすると一発でその時刻にジャンプする（時モード・外側）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const ring = screen.getByTestId("time-dial-ring");

    // 90度・外側リング半径(輪の縁寄り)をタップ = 3時。ドラッグ開始なしで即座に反映される。
    fireEvent.pointerDown(ring, { clientX: 90 + 60, clientY: 90 });

    expect(onTimeChange).toHaveBeenLastCalledWith("03:00");
  });

  it("輪の中心寄りをタップすると内側リング(13〜23・00)の時刻が選ばれる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const ring = screen.getByTestId("time-dial-ring");

    // 90度・内側リング半径(中心寄り)をタップ = 15時。
    fireEvent.pointerDown(ring, { clientX: 90 + 34, clientY: 90 });

    expect(onTimeChange).toHaveBeenLastCalledWith("15:00");
  });

  it("外側の1〜12と、内側の主要4つ(00・15・18・21)が常に数字として表示される（時モード）", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    for (const outerValue of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(within(svg).getByText(String(outerValue))).toBeInTheDocument();
    }
    for (const innerValue of ["00", "15", "18", "21"]) {
      expect(within(svg).getByText(innerValue)).toBeInTheDocument();
    }
    // 主要でない内側の値(例: 14時)は選択されていない間は表示されない。
    expect(within(svg).queryByText("14")).not.toBeInTheDocument();
  });

  it("選択中の時刻が、主要でない内側の位置でも数字として表示される（時モード）", () => {
    render(<TimeDialPicker time="14:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 14:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    expect(within(svg).getByText("14")).toBeInTheDocument();
  });
```

`import` 文の先頭に `within` を追加する:

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/time-dial-picker.test.tsx --reporter=dot`
Expected: FAIL(`data-testid="time-dial-ring"` が無い、二重リングの数字が描画されていない)

- [ ] **Step 3: `components/plan/time-dial-picker.tsx` を実装する**

`import` 文を次で置き換える:

```tsx
import {
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  buildHourDialPositions,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  TIME_DIAL_INNER_RADIUS,
  TIME_DIAL_OUTER_RADIUS,
  TIME_DIAL_STEP_MINUTES,
  type TimeDialMode
} from "@/lib/domain/plan/time-dial";
```

`handlePointerMove` を、角度に加えて中心からの距離(半径)も計算して渡すように置き換える:

```tsx
  const localPointFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) {
      return null;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scale = DIAL_VIEWBOX_SIZE / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }, []);

  const applyPoint = useCallback(
    (localX: number, localY: number) => {
      const angleDeg = clientPointToAngleDeg(localX, localY);
      const radius = Math.hypot(localX - 90, localY - 90);
      const nextMinutes = angleToMinutes(angleDeg, radius, mode, minutesRef.current);
      onTimeChange(formatMinutesToTime(nextMinutes));
    },
    [mode, onTimeChange]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const point = localPointFromEvent(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      applyPoint(point.x, point.y);
    },
    [applyPoint, localPointFromEvent]
  );
```

`svg` 要素の中身(156行目付近、`<circle cx="90" cy="90" r="72" ...>` から `</svg>` まで)を次で置き換える。輪本体に `data-testid="time-dial-ring"` と `onPointerDown` を追加し、「分」モードは今まで通りの単一リング描画、「時」モードは二重リング描画に分岐する:

```tsx
          <svg
            ref={svgRef}
            data-testid="time-dial-svg"
            viewBox={`0 0 ${DIAL_VIEWBOX_SIZE} ${DIAL_VIEWBOX_SIZE}`}
            width={160}
            height={160}
            style={{ touchAction: "none" }}
          >
            <circle
              data-testid="time-dial-ring"
              cx="90"
              cy="90"
              r="72"
              fill="none"
              className="stroke-line"
              strokeWidth={2}
              style={{ cursor: "pointer" }}
              onPointerDown={(event) => {
                const point = localPointFromEvent(event.clientX, event.clientY);
                if (!point) {
                  return;
                }
                applyPoint(point.x, point.y);
                draggingRef.current = true;
              }}
            />
            {mode === "minute" ? (
              <>
                {ticks.map((tick, index) => (
                  <line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} className="stroke-line-strong" strokeWidth={1.5} />
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
                    className={tickLabel.label === m ? "fill-white transition-all" : "fill-muted transition-all"}
                  >
                    {tickLabel.label}
                  </text>
                ))}
                {tickLabels
                  .filter((tickLabel) => tickLabel.label === m)
                  .map((tickLabel) => (
                    <circle
                      key="selected-minute-bg"
                      cx={tickLabel.x}
                      cy={tickLabel.y}
                      r={12}
                      className="fill-pine transition-all"
                    />
                  ))}
              </>
            ) : (
              hourPositions.map((position) => {
                const outerSelected = hour === position.outerValue;
                const innerSelected = hour === position.innerValue;
                const showInner = position.innerAlwaysVisible || innerSelected;
                const outerPoint = pointForAngleDeg(position.angleDeg, TIME_DIAL_OUTER_RADIUS);
                const innerPoint = pointForAngleDeg(position.angleDeg, TIME_DIAL_INNER_RADIUS);
                return (
                  <React.Fragment key={position.angleDeg}>
                    {outerSelected ? (
                      <circle cx={outerPoint.x} cy={outerPoint.y} r={13} className="fill-pine transition-all" />
                    ) : null}
                    <text
                      x={outerPoint.x}
                      y={outerPoint.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={14}
                      fontWeight={700}
                      className={outerSelected ? "fill-white transition-all" : "fill-ink transition-all"}
                    >
                      {position.outerValue}
                    </text>
                    {showInner ? (
                      <>
                        {innerSelected ? (
                          <circle cx={innerPoint.x} cy={innerPoint.y} r={11} className="fill-pine transition-all" />
                        ) : null}
                        <text
                          x={innerPoint.x}
                          y={innerPoint.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={10}
                          fontWeight={500}
                          className={innerSelected ? "fill-white transition-all" : "fill-subtle transition-all"}
                        >
                          {String(position.innerValue).padStart(2, "0")}
                        </text>
                      </>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
            <line x1={90} y1={90} x2={hand.x} y2={hand.y} className="stroke-pine transition-all" strokeWidth={4} strokeLinecap="round" />
            <circle cx={90} cy={90} r={4} className="fill-pine" />
            <circle
              role="slider"
              aria-label={`${fieldLabel}のつまみ`}
              aria-valuemin={mode === "hour" ? 0 : 0}
              aria-valuemax={mode === "hour" ? 23 : 55}
              aria-valuenow={mode === "hour" ? Number(h) : Number(m)}
              aria-valuetext={`${h}:${m}`}
              tabIndex={0}
              cx={hand.x}
              cy={hand.y}
              r={6}
              className="fill-surface stroke-pine transition-all"
              strokeWidth={3}
              style={{ cursor: "grab" }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                draggingRef.current = true;
              }}
              onKeyDown={(event) => {
                const step = mode === "hour" ? 60 : TIME_DIAL_STEP_MINUTES;
                if (event.key === "ArrowUp" || event.key === "ArrowRight") {
                  event.preventDefault();
                  onTimeChange(formatMinutesToTime((minutesRef.current + step + 24 * 60) % (24 * 60)));
                } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  onTimeChange(formatMinutesToTime((minutesRef.current - step + 24 * 60) % (24 * 60)));
                }
              }}
            />
          </svg>
```

`ticks`/`tickLabels`/`hourPositions` の算出を、`hand` の直前に追加する(既存の `const hand = handPointForMinutes(minutes, mode);` の直後):

```tsx
  const hand = handPointForMinutes(minutes, mode);
  const ticks = buildDialTicks(mode);
  const tickLabels = buildDialTickLabels(mode);
  const hourPositions = buildHourDialPositions();
```

`pointForAngleDeg` を `lib/domain/plan/time-dial` からの import に追加する(座標計算に使う):

```tsx
import {
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  buildHourDialPositions,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  pointForAngleDeg,
  TIME_DIAL_INNER_RADIUS,
  TIME_DIAL_OUTER_RADIUS,
  TIME_DIAL_STEP_MINUTES,
  type TimeDialMode
} from "@/lib/domain/plan/time-dial";
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/time-dial-picker.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add components/plan/time-dial-picker.tsx tests/plan/time-dial-picker.test.tsx
git commit -m "feat: render TimeDialPicker hour mode as a dual ring with tap-to-jump"
```

---

### Task 3: 空き状況の時間帯内訳(4時間×6区分)をドメイン層に追加する

**Files:**
- Modify: `lib/domain/plan/group-availability.ts`
- Test: `tests/plan/group-availability.test.ts`

**Interfaces:**
- Consumes: なし(既存の `buildDailyBusySummaries` の内部ロジックを拡張するだけ)
- Produces:
  - `DAILY_BUSY_TIMELINE_SEGMENT_HOURS = 4`
  - `DAILY_BUSY_TIMELINE_SEGMENT_COUNT = 6`
  - `DailyBusySummary` 型に `segments: number[]`(長さ6、各区分の同時busy人数の最大値)を追加

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/group-availability.test.ts` の末尾、`describe` ブロックの閉じ括弧の直前に追加する:

```ts
  it("日次集計に、4時間×6区分ごとの最大同時busy人数を含む", () => {
    const summaries = buildDailyBusySummaries({
      busyByParticipant: [
        // 参加者A: 10:00〜11:00 busy(区分2=8〜12時)
        [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T11:00:00+09:00" }],
        // 参加者B: 10:30〜11:30 busy(区分2=8〜12時、Aと重なる) + 14:00〜15:00 busy(区分3=12〜16時、単独)
        [
          { start: "2026-07-15T10:30:00+09:00", end: "2026-07-15T11:30:00+09:00" },
          { start: "2026-07-15T14:00:00+09:00", end: "2026-07-15T15:00:00+09:00" }
        ]
      ],
      range: { start: "2026-07-15T00:00:00+09:00", end: "2026-07-16T00:00:00+09:00" }
    });

    const segments = summaries["2026-07-15"].segments;
    expect(segments).toHaveLength(DAILY_BUSY_TIMELINE_SEGMENT_COUNT);
    expect(segments[0]).toBe(0); // 0〜4時: 誰も予定なし
    expect(segments[1]).toBe(0); // 4〜8時: 誰も予定なし
    expect(segments[2]).toBe(2); // 8〜12時: AとBが重なる
    expect(segments[3]).toBe(1); // 12〜16時: Bのみ
    expect(segments[4]).toBe(0); // 16〜20時
    expect(segments[5]).toBe(0); // 20〜24時
  });

  it("時間帯内訳の区分数は24時間を4時間ずつに割った数になる", () => {
    expect(DAILY_BUSY_TIMELINE_SEGMENT_COUNT).toBe(24 / DAILY_BUSY_TIMELINE_SEGMENT_HOURS);
  });
```

`import` 文に `DAILY_BUSY_TIMELINE_SEGMENT_COUNT`, `DAILY_BUSY_TIMELINE_SEGMENT_HOURS` を追加する。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/group-availability.test.ts --reporter=dot`
Expected: FAIL(`DAILY_BUSY_TIMELINE_SEGMENT_COUNT` が存在しない、`segments` が `undefined`)

- [ ] **Step 3: `lib/domain/plan/group-availability.ts` を実装する**

`DAY_MILLISECONDS` の定義の直後に定数を追加する:

```ts
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export const DAILY_BUSY_TIMELINE_SEGMENT_HOURS = 4;
export const DAILY_BUSY_TIMELINE_SEGMENT_COUNT = 24 / DAILY_BUSY_TIMELINE_SEGMENT_HOURS;
```

`DailyBusySummary` 型に `segments` を追加する:

```ts
export type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
  /** 4時間ごと・計6区分の、区分内での同時busy人数の最大値。 */
  segments: number[];
};
```

`buildDailyBusySummaries` の中の日次ループを次で置き換える(既存の1パス走査に、区分ごとの最大値を同時に記録する処理を追加する):

```ts
  const slotsPerDay = DAY_MILLISECONDS / SLOT_MILLISECONDS;
  const slotsPerSegment = slotsPerDay / DAILY_BUSY_TIMELINE_SEGMENT_COUNT;

  for (let dayStart = startTime; dayStart < endTime; dayStart += DAY_MILLISECONDS) {
    const dayEnd = dayStart + DAY_MILLISECONDS;
    const date = formatTokyoIso(dayStart).slice(0, 10);

    // 参加者ごとのbusyスロット数を1回の走査で数える。全スロットでbusyだった
    // 人数がそのまま「終日」で、走査ごとの合計の最大値が「最大同時busy人数」。
    // 区分ごとの最大値も同じ走査の中でついでに記録する。
    const busySlotCountByParticipant = new Array(busyByParticipant.length).fill(0);
    let maxBusyCount = 0;
    const segments = new Array(DAILY_BUSY_TIMELINE_SEGMENT_COUNT).fill(0);

    let slotIndex = 0;
    for (let slotStart = dayStart; slotStart < dayEnd; slotStart += SLOT_MILLISECONDS, slotIndex++) {
      const slot = { start: formatTokyoIso(slotStart), end: formatTokyoIso(slotStart + SLOT_MILLISECONDS) };
      let busyCount = 0;
      busyByParticipant.forEach((busyRanges, index) => {
        if (busyRanges.some((busyRange) => overlaps(slot, busyRange))) {
          busySlotCountByParticipant[index] += 1;
          busyCount += 1;
        }
      });
      maxBusyCount = Math.max(maxBusyCount, busyCount);
      const segmentIndex = Math.floor(slotIndex / slotsPerSegment);
      segments[segmentIndex] = Math.max(segments[segmentIndex], busyCount);
    }

    const allDayBusyCount = busySlotCountByParticipant.filter((count) => count === slotsPerDay).length;

    summaries[date] = { maxBusyCount, allDayBusyCount, segments };
  }
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/group-availability.test.ts --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add lib/domain/plan/group-availability.ts tests/plan/group-availability.test.ts
git commit -m "feat: add hourly busy segments to daily availability summaries"
```

---

### Task 4: 時間帯内訳バーの表示コンポーネント

**Files:**
- Create: `components/plan/daily-busy-timeline-bar.tsx`
- Test: `tests/plan/daily-busy-timeline-bar.test.tsx`

**Interfaces:**
- Consumes: `segments: number[]`(Task 3 の `DailyBusySummary.segments`、長さ6)
- Produces: `DailyBusyTimelineBar({ segments }: { segments: number[] })` コンポーネント

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/daily-busy-timeline-bar.test.tsx` を新規作成する:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DailyBusyTimelineBar } from "@/components/plan/daily-busy-timeline-bar";

describe("DailyBusyTimelineBar", () => {
  it("区分ごとに、予定なし/一人/複数人のトーンを塗り分ける", () => {
    render(<DailyBusyTimelineBar segments={[0, 1, 2, 0, 1, 2]} />);

    const bars = screen.getAllByTestId("timeline-segment");
    expect(bars).toHaveLength(6);
    expect(bars[0].className).not.toContain("skywash");
    expect(bars[1].className).toContain("bg-skywash/45");
    expect(bars[2].className).toContain("bg-skywash/85");
    expect(bars[4].className).toContain("bg-skywash/45");
    expect(bars[5].className).toContain("bg-skywash/85");
  });

  it("4時間区切りの時刻ラベルを表示する", () => {
    render(<DailyBusyTimelineBar segments={[0, 0, 0, 0, 0, 0]} />);

    for (const label of ["0", "4", "8", "12", "16", "20", "24"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/daily-busy-timeline-bar.test.tsx --reporter=dot`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: `components/plan/daily-busy-timeline-bar.tsx` を実装する**

```tsx
const SEGMENT_HOUR_LABELS = ["0", "4", "8", "12", "16", "20", "24"];

function toneClassName(maxBusyCount: number) {
  if (maxBusyCount >= 2) {
    return "bg-skywash/85";
  }
  if (maxBusyCount === 1) {
    return "bg-skywash/45";
  }
  return "bg-surface";
}

/**
 * 参加者全体の空き状況を、4時間ごと6区分の横棒で示す。個別の予定内容は持たず、
 * 区分ごとの最大同時busy人数(何人重なっているか)だけを塗り分ける。
 */
export function DailyBusyTimelineBar({ segments }: { segments: number[] }) {
  return (
    <div>
      <div className="flex h-7 overflow-hidden rounded-control border border-line">
        {segments.map((maxBusyCount, index) => (
          <div key={index} data-testid="timeline-segment" className={`flex-1 ${toneClassName(maxBusyCount)}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-caption text-subtle">
        {SEGMENT_HOUR_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/daily-busy-timeline-bar.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/daily-busy-timeline-bar.tsx tests/plan/daily-busy-timeline-bar.test.tsx
git commit -m "feat: add DailyBusyTimelineBar component"
```

---

### Task 5: GroupAvailabilityCalendar の役割を見出し・連携状況に縮小する

**Files:**
- Modify: `components/plan/group-availability-calendar.tsx`
- Test: `tests/plan/group-availability-calendar.test.tsx`

**Interfaces:**
- Consumes: Task 3 で `segments` が増えた `DailyBusySummary`
- Produces:
  - `GroupAvailabilityCalendar` の props から `selectedRange` を削除する
  - 新しい prop `onConnectionStatus?: (status: { connectedCount: number; memberCount: number }) => void` を追加する(データ取得成功時に呼ばれる)
  - `onAvailabilityByDate` の型は `Record<string, DailyBusySummary>`(`segments` を含む形)のまま

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/group-availability-calendar.test.tsx` を開き、`selectedRange` を渡している箇所・「選択中: 空き」を検証している箇所を確認する。まず先頭近くのモックレスポンスすべてに `segments: [0, 0, 0, 0, 0, 0]` を追加する(既存の `dailyBusySummaries` の各エントリに)。

次のテストを追加する(既存テストの構成に合わせて `describe` の中に追記):

```tsx
  it("onConnectionStatus に連携人数を渡す", async () => {
    const onConnectionStatus = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 3,
          dailyBusySummaries: {}
        })
      }))
    );

    render(
      <GroupAvailabilityCalendar
        eventId="event-1"
        visibleMonth="2026-07"
        onConnectionStatus={onConnectionStatus}
      />
    );

    await waitFor(() => expect(onConnectionStatus).toHaveBeenCalledWith({ connectedCount: 2, memberCount: 3 }));
  });

  it("selectedRange 相当の「選択中」文言はもう表示しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          dailyBusySummaries: {}
        })
      }))
    );

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" />);

    expect(await screen.findByText("参加者 2人中 2人分のカレンダー")).toBeInTheDocument();
    expect(screen.queryByText(/選択中: 空き/)).not.toBeInTheDocument();
    expect(screen.queryByText(/日時を選ぶと、その候補で/)).not.toBeInTheDocument();
  });
```

既存テストのうち `selectedRange` prop を渡している呼び出しから、その prop を削除する(コンポーネント側が受け取らなくなるため)。「選択中: 空き」を検証している既存テストは削除する(この振る舞い自体を削除するため)。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/group-availability-calendar.test.tsx --reporter=dot`
Expected: FAIL(`onConnectionStatus` が呼ばれない、「選択中」文言がまだ出る)

- [ ] **Step 3: `components/plan/group-availability-calendar.tsx` を実装する**

ファイル全体を次で置き換える:

```tsx
"use client";

import { RefreshCw, Users } from "lucide-react";
import React from "react";
import { useCallback, useEffect, useState } from "react";

type DailyBusySummary = {
  maxBusyCount: number;
  allDayBusyCount: number;
  segments: number[];
};

type AvailabilityResponse = {
  month: string;
  updatedAt: string;
  /** カレンダーを連携している人数。空きの計算はこの人数を母数にする。 */
  connectedCount: number;
  /** イベントの参加者総数。連携していない人もここには入る。 */
  memberCount: number;
  dailyBusySummaries: Record<string, DailyBusySummary>;
};

type AvailabilityErrorResponse = { error?: string; code?: string };
const accessDeniedMessage = "日程調整中の主催者だけが空き状況を集計できます。";

/** 取得中/取得後でaria-liveブロックの高さを揃えるための最低高。 */
export const AVAILABILITY_STATUS_MIN_HEIGHT_CLASS = "min-h-5";

/**
 * availability がまだ無い間の既定値。`?? {}` を直接書くとレンダーのたびに
 * 新しいオブジェクトができ、それを依存配列に持つ useEffect が毎回発火して
 * 親の setState → 再レンダー → 新しい {} … と無限ループになる。
 */
const EMPTY_DAILY_BUSY_SUMMARIES: Record<string, DailyBusySummary> = {};

export function GroupAvailabilityCalendar({
  eventId,
  visibleMonth,
  onAvailabilityByDate,
  onConnectionStatus
}: {
  eventId: string;
  visibleMonth: string;
  onAvailabilityByDate?: (availabilityByDate: Record<string, DailyBusySummary>) => void;
  onConnectionStatus?: (status: { connectedCount: number; memberCount: number }) => void;
}) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setErrorCode("");

    fetch(`/api/events/${eventId}/availability?month=${visibleMonth}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as AvailabilityResponse | AvailabilityErrorResponse;
        if (!response.ok) {
          const reason = new Error("error" in data && data.error ? data.error : "空き状況を取得できませんでした。");
          if ("code" in data && data.code) {
            reason.name = data.code;
          }
          throw reason;
        }
        return data as AvailabilityResponse;
      })
      .then((data) => setAvailability(data))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setAvailability(null);
        setErrorCode(reason instanceof Error ? reason.name : "");
        setError(reason instanceof Error ? reason.message : "空き状況を取得できませんでした。");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [eventId, refreshKey, visibleMonth]);

  const dailyBusySummaries = availability?.dailyBusySummaries ?? EMPTY_DAILY_BUSY_SUMMARIES;
  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    onAvailabilityByDate?.(dailyBusySummaries);
  }, [dailyBusySummaries, onAvailabilityByDate]);

  useEffect(() => {
    if (!availability) {
      return;
    }
    onConnectionStatus?.({ connectedCount: availability.connectedCount, memberCount: availability.memberCount });
  }, [availability, onConnectionStatus]);

  return (
    <section className="rounded-control border border-moss/20 bg-mist/24 p-4" aria-labelledby="group-availability-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-5 w-5 text-pine" />
            <h3 id="group-availability-heading" className="text-base font-bold text-ink">
              参加者全体の空き状況
            </h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">予定の名前・場所・個別の空き時間は表示しません。</p>
        </div>
        {error !== accessDeniedMessage ? (
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 sm:self-auto"
            aria-label="空き状況を更新"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            更新
          </button>
        ) : null}
      </div>

      <div className={`mt-4 ${AVAILABILITY_STATUS_MIN_HEIGHT_CLASS}`} aria-live="polite">
        {loading ? <p className="text-sm text-muted">空き状況を集計しています。</p> : null}
        {error ? (
          <div className="rounded-control border border-clay/25 bg-clay/10 p-3 text-sm text-ink">
            <p>{error}</p>
            {errorCode === "calendar_reconnect_required" ? (
              <a href={`/api/google-calendar/connect?next=${encodeURIComponent(`/events/${eventId}/plans/new`)}`} className="mt-2 inline-flex font-bold text-pine underline underline-offset-4">
                Google Calendar を再連携
              </a>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && availability ? (
          availability.connectedCount === 0 ? (
            /* 誰も連携していないと集計するものが無い。空きゼロと紛らわしいので、はっきり分ける。 */
            <p className="text-sm leading-6 text-muted">
              カレンダーを連携している参加者がまだいません。候補日時を出して、回答を集めてください。
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {/*
               * 分母は必ず出す。連携している人数を書かずに「空き8人」とだけ見せると、
               * 連携していない人まで空いていると読めてしまう。
               */}
              <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold text-pine">
                参加者 {availability.memberCount}人中 {availability.connectedCount}人分のカレンダー
              </span>
              {availability.connectedCount < availability.memberCount ? (
                <span className="w-full text-sm leading-6 text-muted">
                  未連携の{availability.memberCount - availability.connectedCount}人はこの集計に入っていません。空いているかどうかは回答で確かめてください。
                </span>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/group-availability-calendar.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/group-availability-calendar.tsx tests/plan/group-availability-calendar.test.tsx
git commit -m "feat: shrink GroupAvailabilityCalendar to header and connection status"
```

---

### Task 6: 候補日タップでインライン展開パネルを出す

**Files:**
- Modify: `components/plan/plan-form.tsx`
- Test: `tests/plan/plan-form.test.tsx`, `tests/plan/plan-form-group-availability.test.tsx`

**Interfaces:**
- Consumes: Task 4 の `DailyBusyTimelineBar`、Task 5 の `GroupAvailabilityCalendar`(`onConnectionStatus` 追加、`selectedRange` 削除)
- Produces: `CalendarPicker` に新しい任意 props `expandedPanelDate`/`renderExpandedPanel` を追加。`onSelectComplete` のシグネチャを `(date: string) => void` に変更(既存の呼び出し側で引数を使わなくても型は互換)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/plan-form.test.tsx` の末尾に追加する:

`vitest.setup.ts` が現在時刻を `2026-07-01T09:00:00+09:00` に固定しているため、初期表示は2026年7月。7月15日・7月16日は確実に当月内・未来日(タップ可能)になる。

```tsx
  it("候補日をタップすると、その日のパネルが展開する", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    const dayButton = screen.getByLabelText(/7月15日.*を選択/);
    fireEvent.click(dayButton);

    expect(await screen.findByRole("button", { name: "候補に追加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^開始 /, hidden: false })).toBeInTheDocument();
  });

  it("別の候補日をタップすると、前のパネルが閉じて新しいパネルが開く", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    await screen.findByRole("button", { name: "候補に追加" });

    fireEvent.click(screen.getByLabelText(/7月16日.*を選択/));

    // パネルは1つだけ表示される(候補に追加ボタンが1つだけ)。
    expect(screen.getAllByRole("button", { name: "候補に追加" })).toHaveLength(1);
  });

  it("同じ候補日をもう一度タップすると、パネルが閉じる", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    const dayButton = screen.getByLabelText(/7月15日.*を選択/);
    fireEvent.click(dayButton);
    await screen.findByRole("button", { name: "候補に追加" });

    fireEvent.click(dayButton);

    expect(screen.queryByRole("button", { name: "候補に追加" })).not.toBeInTheDocument();
  });

  it("パネル内の「候補に追加」で候補が追加され、パネルが閉じる", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    const addButton = await screen.findByRole("button", { name: "候補に追加" });
    fireEvent.click(addButton);

    expect(screen.queryByRole("button", { name: "候補に追加" })).not.toBeInTheDocument();
    expect(screen.getByText(/を候補に追加しました。/)).toBeInTheDocument();
  });
```

`tests/plan/plan-form-group-availability.test.tsx` を開き、既存のモックレスポンスすべてに `segments: [0, 0, 0, 0, 0, 0]` を各 `dailyBusySummaries` エントリへ追加する。「選択中: 空き」や「参加者 2人中 2人分のカレンダー」を検証しているアサーションは、その文言が今はパネルの中(候補日タップ後)に出ることを踏まえて、次のように変更する:

```tsx
  it("候補日をタップすると、匿名の時間帯内訳と連携人数が見える", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          connectedCount: 2,
          memberCount: 2,
          dailyBusySummaries: {
            "2026-07-15": { maxBusyCount: 2, allDayBusyCount: 0, segments: [0, 0, 1, 2, 0, 0] }
          }
        })
      }))
    );

    render(<PlanForm action={vi.fn()} submitLabel="作成" eventId="event-1" calendarAvailability={{ enabled: true }} />);

    const dayButton = await screen.findByLabelText(/7月15日.*を選択/);
    fireEvent.click(dayButton);

    expect(await screen.findByText("参加者 2人中 2人分のカレンダー")).toBeInTheDocument();
    expect(screen.getAllByTestId("timeline-segment")[3].className).toContain("bg-skywash/85");
  });
```

既存の1件目のテスト(「参加者全体の空き状況」の見出しと「参加者 2人中 2人分のカレンダー」だけを見ていたテスト)は、見出しのアサーションだけ残し、「参加者 N人中M人分のカレンダー」のアサーションは削除する(そのテキストは日付をタップした後のパネルの中に移ったため)。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx tests/plan/plan-form-group-availability.test.tsx --reporter=dot`
Expected: FAIL(タップしてもパネルが出ない)

- [ ] **Step 3: `components/plan/plan-form.tsx` を実装する**

`import` 文に `DailyBusyTimelineBar` を追加する:

```tsx
import { DailyBusyTimelineBar } from "@/components/plan/daily-busy-timeline-bar";
```

`groupAvailabilityByDate` の state 定義(`Record<string, { maxBusyCount: number; allDayBusyCount: number }>`)を、`segments` を含む形に変更する:

```tsx
  const [groupAvailabilityByDate, setGroupAvailabilityByDate] = useState<
    Record<string, { maxBusyCount: number; allDayBusyCount: number; segments: number[] }>
  >({});
  const [groupConnectionStatus, setGroupConnectionStatus] = useState({ connectedCount: 0, memberCount: 0 });
  const [expandedPanelDate, setExpandedPanelDate] = useState<string | null>(null);
```

`CalendarPicker` 関数の props 型定義に `expandedPanelDate`/`renderExpandedPanel` を追加し、`availabilityByDate` の型も `segments` を含む形に変更する:

```tsx
function CalendarPicker({
  label = "日付を選択",
  selectedDate,
  visibleMonth,
  onSelectDate,
  onChangeMonth,
  minDate,
  busyCounts = {},
  availabilityByDate = {},
  rangeStartDate,
  rangeEndDate,
  onSelectRange,
  onSelectComplete,
  expandedPanelDate,
  renderExpandedPanel
}: {
  label?: string;
  selectedDate: string;
  visibleMonth: Date;
  onSelectDate: (value: string) => void;
  onChangeMonth: (value: Date) => void;
  minDate?: string;
  busyCounts?: Record<string, number>;
  availabilityByDate?: Record<string, { maxBusyCount: number; allDayBusyCount: number; segments: number[] }>;
  rangeStartDate?: string;
  rangeEndDate?: string;
  onSelectRange?: (start: string, end: string) => void;
  onSelectComplete?: (date: string) => void;
  /** タップした日付のパネルを開いた状態にするとき、その日付。 */
  expandedPanelDate?: string | null;
  /** `expandedPanelDate` があるとき、日付グリッドの直下に表示するパネルの中身。 */
  renderExpandedPanel?: (date: string) => React.ReactNode;
}) {
```

day-cell の `onClick`(範囲選択の1日タップ分岐)を次で置き換える:

```tsx
              onClick={() => {
                if (disabled) {
                  return;
                }
                if (onSelectRange) {
                  if (dragMovedRef.current) {
                    dragMovedRef.current = false;
                    return;
                  }
                  onSelectRange(cell.date, cell.date);
                  onSelectComplete?.(cell.date);
                  return;
                }
                onSelectDate(cell.date);
              }}
```

`onPointerUp`(ドラッグ確定)を次で置き換える:

```tsx
              onPointerUp={() => {
                if (!onSelectRange || !dragStartDate) {
                  return;
                }
                const completedDate = dragEndDate ?? dragStartDate;
                setDragStartDate(null);
                setDragEndDate(null);
                onSelectComplete?.(completedDate);
              }}
```

日付グリッドの `<div className="grid grid-cols-7 gap-1">{cells.map(...)}</div>` の直後(`CalendarPicker` の return の中、outer `<div>` が閉じる直前)に、パネルの描画を追加する:

```tsx
      {expandedPanelDate && renderExpandedPanel ? (
        <div className="mt-3 border-t border-dashed border-moss/20 pt-3">{renderExpandedPanel(expandedPanelDate)}</div>
      ) : null}
    </div>
  );
}
```

`PlanForm` 内、`updateCandidateDate` を次で置き換える(パネル開閉の副作用は `onSelectComplete` 側に移すため、ここでは `focusWithSmoothScroll` を呼ばなくなる):

```tsx
  function updateCandidateDate(value: string) {
    setCandidateDate(value);
    setCandidateEndDate((currentEndDate) => (currentEndDate === candidateDate || currentEndDate < value ? value : currentEndDate));
    setVisibleMonth(toMonthDate(value));
  }

  function toggleCandidateDatePanel(date: string) {
    updateCandidateDate(date);
    setExpandedPanelDate((current) => (current === date ? null : date));
  }
```

`addCandidateDate` の成功パス(`setMessage(...)` の直後)に、パネルを閉じる行を追加する:

```tsx
    setCandidateDates((current) =>
      [...current, { start: selectedCandidateStart, end: selectedCandidateEnd, isAllDay: candidateIsAllDay }].sort((left, right) =>
        left.start.localeCompare(right.start)
      )
    );
    setMessage(`${formatDateTime(selectedCandidateStart)} を候補に追加しました。`);
    setExpandedPanelDate(null);
  }
```

候補日パネルの中身を作る関数を、`applyTemplateTime` の直前に追加する:

```tsx
  function renderCandidateDatePanel(date: string) {
    const dailyBusy = groupAvailabilityByDate[date];
    return (
      <div className="grid gap-4">
        <div>
          <p className="text-base font-bold text-ink">{formatDateLabel(date)}</p>
          {groupConnectionStatus.memberCount > 0 ? (
            <p className="mt-1 text-sm text-muted">
              参加者 {groupConnectionStatus.memberCount}人中 {groupConnectionStatus.connectedCount}人分のカレンダー
            </p>
          ) : null}
        </div>
        {dailyBusy ? <DailyBusyTimelineBar segments={dailyBusy.segments} /> : null}
        <label className="flex items-center gap-3 rounded-control border border-moss/16 bg-surface px-4 py-3 text-sm font-bold text-ink">
          <input
            type="checkbox"
            aria-label="終日"
            checked={candidateIsAllDay}
            onChange={(event) => setCandidateIsAllDay(event.target.checked)}
            className="h-5 w-5 rounded border-line text-moss focus:ring-clay"
          />
          終日
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-bold text-ink">開始時間</p>
            <TimeDialPicker time={candidateStartTime} onTimeChange={setCandidateStartTime} label="開始" fieldLabel="開始" buttonRef={candidateHourRef} />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">終了時間</p>
            <TimeDialPicker time={candidateEndTime} onTimeChange={setCandidateEndTime} label="終了" fieldLabel="終了" />
          </div>
        </div>
        {candidateIsPast ? (
          <p className="rounded-control border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
            過去の日時は候補にできません。
          </p>
        ) : null}
        {candidateEndIsInvalid ? (
          <p className="rounded-control border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
            終了時間は開始時間より後にしてください。
          </p>
        ) : null}
        <button
          type="button"
          onClick={addCandidateDate}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          候補に追加
        </button>
      </div>
    );
  }
```

`currentStep === 0` セクションの中身(`CalendarPicker` の呼び出しから、旧・終日チェックボックス/謎解きテンプレート/時刻グリッド/追加ボタン/選択中テキストまで)を次で置き換える(謎解きテンプレートは Task 7 で削除するので、ここでは一旦そのまま残す):

```tsx
          <CalendarPicker
            label="候補日を選択"
            selectedDate={candidateDate}
            visibleMonth={visibleMonth}
            onSelectDate={updateCandidateDate}
            onChangeMonth={setVisibleMonth}
            minDate={today}
            busyCounts={busyCounts}
            availabilityByDate={groupAvailabilityByDate}
            rangeStartDate={candidateDate}
            rangeEndDate={candidateEndDate}
            onSelectRange={updateCandidateRange}
            onSelectComplete={toggleCandidateDatePanel}
            expandedPanelDate={expandedPanelDate}
            renderExpandedPanel={renderCandidateDatePanel}
          />
          {eventId ? (
            <GroupAvailabilityCalendar
              eventId={eventId}
              visibleMonth={visibleMonthKey}
              onAvailabilityByDate={setGroupAvailabilityByDate}
              onConnectionStatus={setGroupConnectionStatus}
            />
          ) : (
            <CalendarAvailabilityPanel
              connected={calendarConnected}
              loading={busyLoading}
              error={busyError}
              selectedDate={candidateDate}
              candidateStart={selectedCandidateStart}
              candidateEnd={selectedCandidateEnd}
              busyRanges={selectedDayBusyRanges}
            />
          )}
          {eventCategory === "nazotoki" ? (
            <div className="rounded-control border border-moss/20 bg-mist/24 p-3">
              <p className="text-sm font-bold text-ink">謎解きテンプレート</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {nazotokiTemplateTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => applyTemplateTime(time)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    {time}〜
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <SelectedCandidates candidates={candidateDates} onRemove={removeCandidateDate} />
```

`onSelectRange={updateCandidateRange}` はそのまま残る(`updateCandidateRange` は変更しない)。`updateCandidateRange` 自体は変更不要(ドラッグ中の見た目更新のみを担当し、パネル開閉は `onSelectComplete` 側の責務のため)。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx tests/plan/plan-form-group-availability.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form.test.tsx tests/plan/plan-form-group-availability.test.tsx
git commit -m "feat: expand an inline panel on candidate date tap"
```

---

### Task 7: 謎解きテンプレート機能を削除する

**Files:**
- Modify: `components/plan/plan-form.tsx`
- Test: `tests/plan/plan-form.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし(末端の削除)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/plan-form.test.tsx` 内で、謎解きテンプレートの表示・`applyTemplateTime` の呼び出しを検証している既存テストを探し、次のテストに置き換える:

```tsx
  it("謎解きカテゴリでも、謎解きテンプレートは表示されない", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

    expect(screen.queryByText("謎解きテンプレート")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: FAIL(テンプレートがまだ表示される)

- [ ] **Step 3: `components/plan/plan-form.tsx` を実装する**

`nazotokiTemplateTimes` 定数の定義行を削除する:

```tsx
const nazotokiTemplateTimes = ["10:00", "13:00", "16:00", "19:00"];
```

`applyTemplateTime` 関数を削除する:

```tsx
  function applyTemplateTime(time: string) {
    const start = toDateTimeLocalValueFromParts(candidateDate, time);
    const end = splitDateTime(addMinutes(start, defaultDurationMinutes), "12:00");
    setCandidateStartTime(time);
    setCandidateEndDate(end.date);
    setCandidateEndTime(end.time);
    setCandidateIsAllDay(false);
    focusWithSmoothScroll(candidateHourRef);
  }
```

Task 6 で残しておいた謎解きテンプレートのJSXブロックを削除する:

```tsx
          {eventCategory === "nazotoki" ? (
            <div className="rounded-control border border-moss/20 bg-mist/24 p-3">
              <p className="text-sm font-bold text-ink">謎解きテンプレート</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {nazotokiTemplateTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => applyTemplateTime(time)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    {time}〜
                  </button>
                ))}
              </div>
            </div>
          ) : null}
```

`defaultDurationMinutes` 定数は `initialCandidateEnd` の算出でも使われているため残す(削除しない)。`addMinutes`/`splitDateTime` 関数もそちらで引き続き使われているため残す。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし(未使用変数の警告が出た場合は、その変数も削除する)

- [ ] **Step 6: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form.test.tsx
git commit -m "feat: remove nazotoki quick-fill template"
```

---

### Task 8: 候補一覧に番号バッジを付ける

**Files:**
- Modify: `components/plan/plan-form.tsx`
- Test: `tests/plan/plan-form.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし(`SelectedCandidates` の見た目のみの変更)

- [ ] **Step 1: 失敗するテストを書く**

`tests/plan/plan-form.test.tsx` の末尾に追加する:

```tsx
  it("追加済みの候補に、丸い番号バッジが付く", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(await screen.findByRole("button", { name: "候補に追加" }));

    // ステップインジケーターにも "1" バッジがあるため、候補一覧側の
    // バッジだけを testid で区別する。
    const badge = await screen.findByTestId("candidate-badge-1");
    expect(badge).toHaveTextContent("1");
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: FAIL(`aria-hidden` な数字バッジが無い、今は「候補 1」というテキストのみ)

- [ ] **Step 3: `components/plan/plan-form.tsx` を実装する**

`SelectedCandidates` 関数の中、候補1件ぶんの `<div>` を次で置き換える:

```tsx
      {candidates.map((candidate, index) => (
        <div key={candidate.start} className="flex items-center gap-3 rounded-control border border-moss/12 bg-surface px-4 py-3">
          <span
            data-testid={`candidate-badge-${index + 1}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep text-xs font-bold tabular-nums text-white"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className="flex-1">
            <p className="text-eyebrow uppercase text-pine">候補 {index + 1}</p>
            <p className="mt-1 text-sm font-bold text-ink">{formatDateTimeRange(candidate.start, candidate.end, candidate.isAllDay)}</p>
          </div>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(candidate.start)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay"
              aria-label={`候補 ${index + 1} を削除`}
              title="削除"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/plan/plan-form.test.tsx --reporter=dot`
Expected: PASS(全件成功)

- [ ] **Step 5: コミット**

```bash
git add components/plan/plan-form.tsx tests/plan/plan-form.test.tsx
git commit -m "feat: add numbered badges to the selected candidate list"
```

---

### Task 9: 全体テストと実機確認

**Files:** なし(検証のみ)

- [ ] **Step 1: プロジェクト全体のテストを実行する**

Run: `npx vitest run --reporter=dot`
Expected: PASS(全件成功。既存の他コンポーネントのテストに影響がないこと)

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: 375px幅で実機確認する**

開発サーバーを起動し(`npm run dev`)、ブラウザの幅を375pxにして `/events/[eventId]/plans/new` を確認する:

- カレンダーの日付をタップすると、その真下にパネルが展開すること。別の日付をタップすると前のパネルが閉じて新しいパネルが開くこと。同じ日付をもう一度タップすると閉じること
- パネル内に、その日の時間帯内訳バー(0/4/8/12/16/20/24時の目盛り)・終日チェック・開始/終了の時計ダイヤル・候補に追加ボタンが順に並ぶこと
- 時計ダイヤルの「時」モードで、外側の1〜12と内側の00・15・18・21が輪の中に表示され、輪のどこをタップしても一発でその時刻にジャンプすること。選択中の数字が塗り丸で強調されること
- 謎解きカテゴリのイベントで、謎解きテンプレートのボタンが表示されないこと
- 候補を追加すると、一覧に①②③のような丸い番号バッジが付くこと

- [ ] **Step 4: コミット不要(検証のみのタスクのため)**

## Self-Review

**Spec coverage:**
- 「1. 候補日タップでインライン展開パネル」→ Task 3, 4, 5, 6
- 「2. 謎解きテンプレート機能の削除」→ Task 7
- 「3. 時計ダイヤルの刷新: 二重リング方式」→ Task 1, 2
- 「4. 候補一覧の番号バッジ」→ Task 8
- 「5. 開始/終了チップの間隔」→ Task 6 で統合パネル化することにより解消(個別タスクなし、spec記載通り)
- テスト方針(spec記載の5項目)→ Task 3(時間帯区分の集計)、Task 1(角度・半径の判定)、Task 2(タップ・ドラッグ・強調表示)、Task 6(パネルの開閉・候補追加)、Task 7(テンプレート削除)、Task 9(実機確認)
すべてカバーしている。

**Placeholder scan:** 各タスクのコードは完全な内容を記載済み。TBD/TODOなし。

**Type consistency:** `DailyBusySummary`(`{ maxBusyCount: number; allDayBusyCount: number; segments: number[] }`)は Task 3 のドメイン層で定義し、Task 5(`GroupAvailabilityCalendar` のローカル型)・Task 6(`groupAvailabilityByDate` state・`CalendarPicker` の `availabilityByDate` prop)で同じ形を一貫して使っている。`CalendarPicker` の `onSelectComplete: (date: string) => void` は Task 6 で定義し、同じタスク内の呼び出し側(`toggleCandidateDatePanel`)と型が一致している。`angleToMinutes(angleDeg, radius, mode, currentMinutes)` は Task 1 で定義し、Task 2 の呼び出し側で同じ引数順を使っている。
