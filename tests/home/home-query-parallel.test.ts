import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("home data loading", () => {
  it("loads independent dashboard data in parallel", () => {
    const page = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");

    expect(page).toContain("await Promise.all([");
    expect(page).toContain('.from("plans")');
    expect(page).toContain('.from("notifications")');
    expect(page).toContain('.from("event_drafts")');
  });
});
