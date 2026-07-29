import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("フォーカスリングのキーボード限定化", () => {
  it("globals.cssに:focus-visibleのベースラインがある", () => {
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline/);
  });

  it("ui-server.tsxのプリミティブはfocus:ではなくfocus-visible:を使う(マウスクリックでリングを出さない)", () => {
    const source = readFileSync(resolve(process.cwd(), "components/ui-server.tsx"), "utf8");

    expect(source).not.toMatch(/\bfocus:/);
    expect(source).toContain("focus-visible:");
  });

  it("ui-client.tsxのプリミティブはfocus:ではなくfocus-visible:を使う(マウスクリックでリングを出さない)", () => {
    const source = readFileSync(resolve(process.cwd(), "components/ui-client.tsx"), "utf8");

    expect(source).not.toMatch(/\bfocus:/);
    expect(source).toContain("focus-visible:");
  });
});
