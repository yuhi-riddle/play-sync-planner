import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("calendar page scope", () => {
  it("loads schedules for events the signed-in user has joined", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).toContain('.from("event_members")');
    expect(page).toContain('createSupabaseAdminClient');
    expect(page).toContain('.in("event_id", joinedEventIds)');
    expect(page).not.toContain('.eq("owner_user_id", user.id)');
  });

  it("月のフォールバックを JST で決める（ローカル時刻の getMonth() を使わない）", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).toContain("toJstDateKey(new Date())");
    // fallback で today.getMonth()/getFullYear() を使うと Vercel(UTC) の深夜に前月へずれる
    expect(page).not.toMatch(/today\.getMonth\(\)/);
    expect(page).not.toMatch(/today\.getFullYear\(\)/);
  });

  it("scopes the plans query to the displayed month instead of fetching every candidate date", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).toContain("monthRangeInTokyo");
    expect(page).toContain('.gte("candidate_dates.start_at"');
    expect(page).toContain('.lt("candidate_dates.start_at"');
    expect(page).toContain("candidate_dates!inner");
  });
});
