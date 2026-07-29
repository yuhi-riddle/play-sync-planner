import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { shouldShowPrimaryNavigation } from "@/lib/navigation-visibility";

/**
 * 下部ナビを隠す「集中画面」。
 * PWAをホーム画面から開くとブラウザの戻るボタンが無いので、
 * 画面の中に戻る導線が無いと行き止まりになる。
 */
const focusedPages: { path: string; file: string }[] = [
  { path: "/events/new", file: "app/events/new/page.tsx" },
  { path: "/events/event-1/edit", file: "app/events/[eventId]/edit/page.tsx" },
  { path: "/events/event-1/plans/new", file: "app/events/[eventId]/plans/new/page.tsx" },
  { path: "/plans/plan-1/edit", file: "app/plans/[planId]/edit/page.tsx" },
  { path: "/plans/plan-1/confirm", file: "app/plans/[planId]/confirm/page.tsx" }
];

describe("集中画面の戻る導線", () => {
  it("対象の画面では下部ナビが隠れている", () => {
    for (const page of focusedPages) {
      expect(shouldShowPrimaryNavigation(page.path)).toBe(false);
    }
  });

  it("すべての集中画面に戻る導線がある", () => {
    for (const page of focusedPages) {
      const source = readFileSync(resolve(process.cwd(), page.file), "utf8");
      expect(source, `${page.file} に戻る導線がありません`).toContain("BackLink");
    }
  });
});
