// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authGetUser, authSignOut, createServerClient } = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  authSignOut: vi.fn(),
  createServerClient: vi.fn()
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { buildContentSecurityPolicy, middleware } from "@/middleware";

const originalEnv = {
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  reportOnly: process.env.CSP_REPORT_ONLY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
};

describe("buildContentSecurityPolicy", () => {
  it("builds a production policy with a nonce and restrictive fallback directives", () => {
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

  it("allows unsafe-eval only for the development policy", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "development-nonce",
      isDevelopment: true,
      supabaseUrl: undefined
    });

    expect(policy).toContain("'unsafe-eval'");
  });
});

describe("middleware security headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUser.mockResolvedValue({ data: { user: null } });
    createServerClient.mockReturnValue({ auth: { getUser: authGetUser, signOut: authSignOut } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.CSP_REPORT_ONLY;
  });

  afterEach(() => {
    restoreEnv("NEXT_PUBLIC_SUPABASE_URL", originalEnv.supabaseUrl);
    restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalEnv.anonKey);
    restoreEnv("CSP_REPORT_ONLY", originalEnv.reportOnly);
  });

  it.each(["/login", "/api/cron/notifications"])(
    "adds security headers without an auth lookup on %s",
    async (pathname) => {
      const response = await middleware(new NextRequest(`http://localhost${pathname}`));

      expect(createServerClient).not.toHaveBeenCalled();
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("permissions-policy")).toContain("camera=()");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
  );

  // 招待リンクは、まだアカウントを持っていない人がログインへ進む入口なので公開のまま。
  it("skips auth and still applies security headers on the invite path", async () => {
    const response = await middleware(new NextRequest("http://localhost/invites/invite-token"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(authGetUser).not.toHaveBeenCalled();
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  /*
   * 共有リンクは対象を探すための入口で、本人確認の材料ではない。
   * 公開のままだと、トークンを知っているだけの人が候補日時や清算額を読める。
   */
  it.each(["/events", "/s/share-token/answer", "/s/share-token/settlement"])(
    "still runs the auth lookup on a protected path %s",
    async (pathname) => {
      await middleware(new NextRequest(`http://localhost${pathname}`));

      expect(createServerClient).toHaveBeenCalledTimes(1);
      expect(authGetUser).toHaveBeenCalledTimes(1);
    }
  );

  it("uses only the report-only header when CSP_REPORT_ONLY is set", async () => {
    process.env.CSP_REPORT_ONLY = "true";

    const response = await middleware(new NextRequest("http://localhost/login"));

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-security-policy-report-only")).toContain("frame-ancestors 'none'");
  });

  it("generates a different nonce for each request", async () => {
    const first = await middleware(new NextRequest("http://localhost/login"));
    const second = await middleware(new NextRequest("http://localhost/login"));

    const firstNonce = first.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    const secondNonce = second.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];

    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it("keeps security headers when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await middleware(new NextRequest("http://localhost/events"));

    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("still signs out and redirects a withdrawn user, with security headers attached", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: { withdrawn_at: "2026-07-01T00:00:00Z" }, user_metadata: {} } }
    });

    const response = await middleware(new NextRequest("http://localhost/events"));

    expect(authSignOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toContain("/login?withdrawn=1");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
