import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Next.js upload configuration", () => {
  it("allows a 2MB avatar plus multipart form overhead", () => {
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(config).toContain('bodySizeLimit: "3mb"');
  });
});
