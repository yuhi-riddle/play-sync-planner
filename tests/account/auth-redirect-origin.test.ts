import { describe, expect, it } from "vitest";

import { resolveAuthRedirectOrigin } from "@/lib/auth/auth-redirect-origin";

const SITE = "https://play-sync-planner.vercel.app";

describe("resolveAuthRedirectOrigin", () => {
  it("returns to production when the login starts on production", () => {
    expect(resolveAuthRedirectOrigin("https://play-sync-planner.vercel.app", SITE)).toBe(SITE);
  });

  // プレビューで始めたログインが本番に戻ってしまうと、ログインが完了しない
  it.each([
    "https://play-sync-planner-git-fix-preview-login-yuhi-riddles-projects.vercel.app",
    "https://play-sync-planner-abc123def-yuhi-riddles-projects.vercel.app"
  ])("returns to the preview deployment %s it started on", (origin) => {
    expect(resolveAuthRedirectOrigin(origin, SITE)).toBe(origin);
  });

  it.each(["http://localhost:3000", "http://localhost:3001"])("returns to local development at %s", (origin) => {
    expect(resolveAuthRedirectOrigin(origin, SITE)).toBe(origin);
  });

  // Host ヘッダーは書き換えられる。知らないサイトには戻さず、本番に戻す
  it.each([
    "https://evil.example.com",
    "https://play-sync-planner-x-yuhi-riddles-projects.vercel.app.evil.example.com",
    "https://play-sync-planner-x-someone-else.vercel.app",
    "http://play-sync-planner-x-yuhi-riddles-projects.vercel.app",
    "javascript:alert(1)",
    ""
  ])("falls back to production for an unknown origin %s", (origin) => {
    expect(resolveAuthRedirectOrigin(origin, SITE)).toBe(SITE);
  });

  it("falls back to production when the request origin is unknown", () => {
    expect(resolveAuthRedirectOrigin(null, SITE)).toBe(SITE);
  });

  it("drops a trailing slash from the configured site URL", () => {
    expect(resolveAuthRedirectOrigin(null, `${SITE}/`)).toBe(SITE);
  });
});
