import "@testing-library/jest-dom/vitest";

import { afterAll, beforeAll, vi } from "vitest";

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
 * テスト内の日付は 2026-07-01 以降がほとんど。その日の 0 時に置くことで、
 * 同じ日に書かれた時刻（例: 2026-07-01T10:00）もすべて未来として扱われる。
 */
const FIXED_NOW = new Date("2026-07-01T00:00:00+09:00");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXED_NOW });
});

afterAll(() => {
  vi.useRealTimers();
});
