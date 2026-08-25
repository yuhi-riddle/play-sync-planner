import "@testing-library/jest-dom/vitest";

import { afterAll, beforeAll, vi } from "vitest";

/**
 * next/font/google はビルド時専用のフォントローダーで、vitest(jsdom)環境では実体を持たない。
 * app/layout.tsx が Zen_Maru_Gothic を呼ぶため、無害なオブジェクトを返すダミーに差し替える。
 */
vi.mock("next/font/google", () => ({
  Zen_Maru_Gothic: () => ({
    className: "font-mock",
    style: { fontFamily: "font-mock" },
    variable: "--font-mock"
  })
}));

/**
 * jsdom は PointerEvent を実装していない（jsdom/jsdom#2527、25系でも未解決）。
 * fireEvent.pointerDown/Move/Up は window.PointerEvent を探しに行き、無ければ
 * 素の Event にフォールバックする。素の Event コンストラクタは clientX/clientY
 * のような未知の init プロパティを黙って捨てるため、ドラッグ系のテストで
 * 座標が undefined になり NaN が出る。MouseEvent を継承した最小限のポリフィルで補う。
 */
if (typeof globalThis.MouseEvent !== "undefined" && typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId?: number;
    public pointerType?: string;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId;
      this.pointerType = params.pointerType;
    }
  }
  // @ts-expect-error jsdom に無い PointerEvent を補うためのポリフィル
  globalThis.PointerEvent = PointerEventPolyfill;
}

/**
 * テストの「現在時刻」を固定する。
 *
 * 候補日時などを未来の日付でハードコードしたテストは、時間が経って
 * その日付に追いつくと「過去の日時は候補にできません」で落ちる。
 * 実際 2026-07-15 になった時点で 5 件が突然落ちた。
 *
 * Date だけを差し替え、setTimeout などのタイマーには触れない
 * （Testing Library の waitFor が動かなくなるため）。
 */
/*
 * テスト内の日付は 2026-07-01 以降がほとんど。その日の早い時刻に置くことで、
 * 同じ日に書かれた時刻（例: 2026-07-01T10:00）もすべて未来として扱われる。
 *
 * 0 時ではなく 9 時なのは、JST の 0 時は UTC ではまだ前日（6/30）だから。
 * カレンダー系のコンポーネントは new Date() のローカル年月日から「今月」を決めるので、
 * TZ=UTC で走らせると 6 月のカレンダーが描かれ、7 月の日付セルを探すテストが
 * 「そんなラベルは無い」で落ちていた（12 件）。
 * JST 09:00 = UTC 00:00 は、JST と UTC が同じ日付（7/1）になる最も早い瞬間。
 * ここに置くことで、どちらの TZ で走らせても「今日は 7/1」になり、
 * かつ 7/1 当日の時刻を未来扱いにする余地を最大限残せる。
 */
const FIXED_NOW = new Date("2026-07-01T09:00:00+09:00");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXED_NOW });
});

afterAll(() => {
  vi.useRealTimers();
});
