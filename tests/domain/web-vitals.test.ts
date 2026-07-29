import { describe, expect, it } from "vitest";

import { mapPathnameToPageTemplate, pageTemplates, isAllowedWebVitalName } from "@/lib/domain/web-vitals";

// 実在する24ルートすべてを対応表どおりに検証する。
const routeTable: Array<[string, string]> = [
  ["/", "home"],
  ["/events", "events"],
  ["/events/new", "event-new"],
  ["/events/event-1", "event-detail"],
  ["/events/event-1/edit", "event-edit"],
  ["/events/event-1/plans/new", "plan-new"],
  ["/plans", "plans"],
  ["/plans/plan-1", "plan-detail"],
  ["/plans/plan-1/edit", "plan-edit"],
  ["/plans/plan-1/confirm", "plan-confirm"],
  ["/plans/plan-1/settlement", "settlement"],
  ["/notifications", "notifications"],
  ["/connections", "connections"],
  ["/settings", "settings"],
  ["/settings/withdraw", "settings-withdraw"],
  ["/login", "login"],
  ["/consent", "consent"],
  ["/onboarding/profile", "onboarding"],
  ["/invites/token-1", "invite"],
  ["/s/token-1/answer", "share-answer"],
  ["/s/token-1/answer/complete", "share-answer-complete"],
  ["/s/token-1/settlement", "share-settlement"],
  ["/terms", "legal"],
  ["/privacy", "legal"]
];

describe("mapPathnameToPageTemplate", () => {
  it.each(routeTable)("maps %s to %s", (pathname, expected) => {
    expect(mapPathnameToPageTemplate(pathname)).toBe(expected);
  });

  it("falls back to other for unknown routes", () => {
    expect(mapPathnameToPageTemplate("/does-not-exist")).toBe("other");
  });

  it("normalizes a trailing slash", () => {
    expect(mapPathnameToPageTemplate("/events/")).toBe("events");
    expect(mapPathnameToPageTemplate("/plans/plan-1/edit/")).toBe("plan-edit");
  });

  it("never maps a real route from the table to other", () => {
    for (const [pathname] of routeTable) {
      expect(mapPathnameToPageTemplate(pathname)).not.toBe("other");
    }
  });

  it("returns only page templates that are declared in pageTemplates", () => {
    for (const [pathname] of routeTable) {
      expect(pageTemplates).toContain(mapPathnameToPageTemplate(pathname));
    }
  });
});

describe("isAllowedWebVitalName", () => {
  it.each(["LCP", "INP", "CLS"])("accepts %s", (name) => {
    expect(isAllowedWebVitalName(name)).toBe(true);
  });

  it.each(["FCP", "TTFB", ""])("rejects %s", (name) => {
    expect(isAllowedWebVitalName(name)).toBe(false);
  });
});
