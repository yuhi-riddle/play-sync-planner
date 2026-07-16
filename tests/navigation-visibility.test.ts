import { describe, expect, it } from "vitest";

import { shouldShowPrimaryNavigation } from "@/lib/navigation-visibility";

describe("shouldShowPrimaryNavigation", () => {
  it.each(["/", "/events", "/events/event-1", "/plans", "/plans/plan-1", "/connections", "/settings"])(
    "shows navigation on %s",
    (pathname) => expect(shouldShowPrimaryNavigation(pathname)).toBe(true)
  );

  it.each([
    "/login",
    "/consent",
    "/auth/callback",
    "/onboarding/profile",
    "/s/token/answer",
    "/invites/token",
    "/events/new",
    "/events/event-1/edit",
    "/events/event-1/plans/new",
    "/plans/plan-1/edit",
    "/plans/plan-1/confirm",
    "/terms",
    "/privacy"
  ])("hides navigation on %s", (pathname) => expect(shouldShowPrimaryNavigation(pathname)).toBe(false));
});
