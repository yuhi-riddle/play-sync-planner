import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("calendar page scope", () => {
  it("delegates joined-event filtering to the scoped calendar RPC", () => {
    const page = readFileSync(resolve(process.cwd(), "app/plans/page.tsx"), "utf8");

    expect(page).toContain('list_calendar_items');
    expect(page).not.toContain('.from("event_members")');
    expect(page).not.toContain('createSupabaseAdminClient');
  });
});
