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

  it("scopes the plans query to the displayed month instead of fetching every candidate date", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).toContain("monthRangeInTokyo");
    expect(page).toContain('.gte("candidate_dates.start_at"');
    expect(page).toContain('.lt("candidate_dates.start_at"');
    expect(page).toContain("candidate_dates!inner");
  });
});
