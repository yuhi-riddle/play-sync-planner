import { describe, expect, it } from "vitest";

import { isAllowedWebVitalName, mapPathnameToPageTemplate } from "@/lib/domain/web-vitals";

describe("mapPathnameToPageTemplate", () => {
  it.each([
    ["/", "home"],
    ["/events", "events"],
    ["/events/event-1", "event-detail"],
    ["/events/event-1/edit", "event-detail"],
    ["/plans", "plans"],
    ["/plans/plan-1", "plans"],
    ["/plans/plan-1/settlement", "plans"],
    ["/connections", "connections"],
    ["/settings", "other"],
    ["/s/token/answer", "other"]
  ])("maps %s to %s", (pathname, expected) => {
    expect(mapPathnameToPageTemplate(pathname)).toBe(expected);
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
