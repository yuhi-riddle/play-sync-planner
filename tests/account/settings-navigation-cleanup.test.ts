import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("settings navigation cleanup", () => {
  it("does not duplicate the primary connections navigation in settings", () => {
    const page = readFileSync(resolve(process.cwd(), "app/settings/page.tsx"), "utf8");

    expect(page).not.toContain("SecondaryLink");
    expect(page).not.toContain("つながりを開く");
  });

  it("places sign-out just above the withdrawal card", () => {
    const page = readFileSync(resolve(process.cwd(), "app/settings/page.tsx"), "utf8");

    const signOut = page.indexOf("<SignOutCard />");
    const withdrawal = page.indexOf("退会の手続きへ");
    expect(signOut).toBeGreaterThan(-1);
    expect(signOut).toBeLessThan(withdrawal);
    expect(page.indexOf("<CalendarConnectionCard")).toBeLessThan(signOut);
  });
});
