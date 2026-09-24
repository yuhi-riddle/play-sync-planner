import { describe, expect, it } from "vitest";

import { getNavigationChrome, shouldShowPrimaryNavigation } from "@/lib/domain/account/navigation-visibility";

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

describe("getNavigationChrome", () => {
  const none = { primaryNav: false, createFab: false, bottomInset: false };

  it("shows nothing to signed-out visitors", () => {
    expect(getNavigationChrome("/events", false)).toEqual(none);
  });

  it.each(["/events", "/plans"])("shows the navigation, the create button and the inset on %s", (pathname) => {
    expect(getNavigationChrome(pathname, true)).toEqual({ primaryNav: true, createFab: true, bottomInset: true });
  });

  it.each(["/", "/events/event-1", "/plans/plan-1", "/connections", "/notifications", "/settings"])(
    "shows the navigation and the inset without the create button on %s",
    (pathname) => {
      expect(getNavigationChrome(pathname, true)).toEqual({ primaryNav: true, createFab: false, bottomInset: true });
    }
  );

  it.each(["/events/new", "/plans/plan-1/confirm", "/s/token/settlement", "/onboarding/profile", "/login"])(
    "shows nothing on %s, where the navigation is hidden",
    (pathname) => {
      expect(getNavigationChrome(pathname, true)).toEqual(none);
    }
  );
});
