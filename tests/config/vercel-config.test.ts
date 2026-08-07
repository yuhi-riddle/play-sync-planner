import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vercel Functions region configuration", () => {
  it("pins execution to Tokyo (hnd1) so it stays close to the Supabase region", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));

    expect(config.regions).toContain("hnd1");
  });
});
