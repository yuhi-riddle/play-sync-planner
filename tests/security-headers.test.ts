import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

describe("セキュリティヘッダ", () => {
  it("全ルートに基本的なヘッダを付ける", async () => {
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/(.*)");

    expect(allRoutes).toBeDefined();
    const headerNames = allRoutes!.headers.map((header) => header.key);

    expect(headerNames).toContain("X-Content-Type-Options");
    expect(headerNames).toContain("X-Frame-Options");
    expect(headerNames).toContain("Referrer-Policy");
    expect(headerNames).toContain("Permissions-Policy");
  });

  it("X-Frame-Options はDENYにする", async () => {
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/(.*)");
    const frameOptions = allRoutes!.headers.find((header) => header.key === "X-Frame-Options");

    expect(frameOptions?.value).toBe("DENY");
  });

  it("Referrer-Policy は共有リンクのトークンを外部に漏らさない設定にする", async () => {
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/(.*)");
    const referrerPolicy = allRoutes!.headers.find((header) => header.key === "Referrer-Policy");

    expect(referrerPolicy?.value).toBe("strict-origin-when-cross-origin");
  });

  it("CSPはReport-Onlyで導入し、まだ強制しない", async () => {
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/(.*)");
    const headerNames = allRoutes!.headers.map((header) => header.key);

    expect(headerNames).toContain("Content-Security-Policy-Report-Only");
    expect(headerNames).not.toContain("Content-Security-Policy");
  });
});
