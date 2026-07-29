import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// layout / 各ページで生の supabase.auth.getUser() を直接呼ぶと、同一リクエスト内で
// getCurrentUser()/getCurrentUserId() のReact cache()が効かず、Supabaseへの往復が重複する。
// レンダー経路のファイルはすべて lib/supabase/server.ts の cache 済みヘルパー経由にする。
const targetFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/events/page.tsx",
  "app/plans/page.tsx",
  "app/connections/page.tsx",
  "app/notifications/page.tsx",
  "app/settings/page.tsx",
  "app/settings/withdraw/page.tsx",
  "app/onboarding/profile/page.tsx",
  "app/events/[eventId]/plans/new/page.tsx",
  "app/plans/[planId]/edit/page.tsx"
];

describe("生のsupabase.auth.getUser()を使わない", () => {
  it.each(targetFiles)("%s は getCurrentUser()/getCurrentUserId() 経由にする", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
    expect(source).not.toContain(".auth.getUser()");
  });
});
