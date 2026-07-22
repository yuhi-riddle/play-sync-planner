import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { buildContentSecurityPolicy, middleware } from "@/middleware";

const originalEnv = {
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  reportOnly: process.env.CSP_REPORT_ONLY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
};

describe("middleware security headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.CSP_REPORT_ONLY;
  });

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalEnv.supabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalEnv.anonKey);
    restoreEnv("CSP_REPORT_ONLY", originalEnv.reportOnly);
  });

  it("builds a production CSP with a nonce and restrictive fallback directives", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "request-nonce",
      isDevelopment: false,
      supabaseUrl: "https://example.supabase.co"
    });

    expect(policy).toContain("script-src 'self' 'nonce-request-nonce'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("https://example.supabase.co");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval only for the development CSP", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "development-nonce",
      isDevelopment: true,
      supabaseUrl: undefined
    });

    expect(policy).toContain("'unsafe-eval'");
  });

  it.each(["/login", "/api/cron/notifications"])(
    "adds headers without an auth lookup on %s",
    async (pathname) => {
      const response = await middleware(new NextRequest(`http://localhost${pathname}`));

      expect(createServerClient).not.toHaveBeenCalled();
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("permissions-policy")).toBe(
        "camera=(), microphone=(), geolocation=(self)"
      );
      expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
    }
  );

  it("generates a different forwarded nonce for each request", async () => {
    const first = await middleware(new NextRequest("http://localhost/login"));
    const second = await middleware(new NextRequest("http://localhost/login"));

    expect(first.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
    expect(second.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe(
      second.headers.get("x-middleware-request-x-nonce")
    );
  });

  it("uses only the report-only CSP header when configured", async () => {
    process.env.CSP_REPORT_ONLY = "true";

    const response = await middleware(new NextRequest("http://localhost/login"));

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-security-policy-report-only")).toContain(
      "frame-ancestors 'none'"
    );
  });

  it("keeps security headers when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await middleware(new NextRequest("http://localhost/events"));

    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
