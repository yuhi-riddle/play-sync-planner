import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { brand } from "@/lib/brand";

describe("PWA manifest", () => {
  it("ブランド名をそのまま使う", () => {
    const result = manifest();

    expect(result.name).toBe(brand.name);
    expect(result.short_name).toBe(brand.shortName);
    expect(result.description).toBe(brand.description);
  });

  it("ホーム画面から開いたときに単独アプリとして表示する", () => {
    const result = manifest();

    expect(result.display).toBe("standalone");
    expect(result.start_url).toBe("/");
  });

  it("インストールに必要な192と512のPNGを持つ", () => {
    const sizes = (manifest().icons ?? []).map((icon) => icon.sizes);

    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((manifest().icons ?? []).every((icon) => icon.type === "image/png")).toBe(true);
  });

  it("maskableアイコンを用意して、丸く切り抜かれても欠けないようにする", () => {
    const purposes = (manifest().icons ?? []).map((icon) => icon.purpose);

    expect(purposes).toContain("maskable");
  });

  it("参照しているアイコンが実際に存在する", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(resolve(process.cwd(), "public", icon.src!.replace(/^\//, "")))).toBe(true);
    }
  });
});
