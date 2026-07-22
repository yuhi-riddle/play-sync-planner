import { createHmac } from "node:crypto";

import { act, render } from "@testing-library/react";
import { NextRequest } from "next/server";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { hookState, recordWebVital, safeLog } = vi.hoisted(() => ({
  hookState: { callback: null as null | ((metric: { name: string; value: number }) => void) },
  recordWebVital: vi.fn(),
  safeLog: vi.fn()
}));

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: vi.fn((callback) => {
    hookState.callback = callback;
  })
}));
vi.mock("@/lib/server/admin/cron-notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/admin/cron-notifications")>()),
  recordWebVital
}));
vi.mock("@/lib/server/safe-log", () => ({ safeLog }));

import { POST } from "@/app/api/performance/vitals/route";
import {
  mapPathnameToPageTemplate,
  WebVitalsReporter
} from "@/components/web-vitals-reporter";
import { timed } from "@/lib/server/timing";

const originalSecret = process.env.RATE_LIMIT_HMAC_SECRET;
const secret = "a-web-vitals-rate-limit-secret-at-least-32-bytes";
const ip = "203.0.113.42";

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/performance/vitals?secret=never-read", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip,
      ...headers
    },
    body
  });
}

describe("web vitals API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RATE_LIMIT_HMAC_SECRET = secret;
    recordWebVital.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET;
    else process.env.RATE_LIMIT_HMAC_SECRET = originalSecret;
  });

  it("accepts only the strict page, metric, value and device contract", async () => {
    const response = await POST(request(JSON.stringify({
      page: "event-detail",
      name: "LCP",
      value: 2400.5,
      device: "mobile"
    })));

    expect(response.status).toBe(204);
    const subjectHash = createHmac("sha256", secret)
      .update(`web_vital:${ip}`)
      .digest("hex");
    expect(recordWebVital).toHaveBeenCalledWith({
      page: "event-detail",
      name: "LCP",
      value: 2400.5,
      device: "mobile"
    }, subjectHash);
    expect(JSON.stringify(recordWebVital.mock.calls)).not.toContain(ip);
  });

  it.each([
    [{ page: "events", name: "FCP", value: 10, device: "mobile" }],
    [{ page: "/events/secret", name: "LCP", value: 10, device: "mobile" }],
    [{ page: "events", name: "LCP", value: Number.POSITIVE_INFINITY, device: "mobile" }],
    [{ page: "events", name: "CLS", value: 11, device: "mobile" }],
    [{ page: "events", name: "INP", value: -1, device: "desktop" }],
    [{ page: "events", name: "LCP", value: 10, device: "tablet" }],
    [{ page: "events", name: "LCP", value: 10, device: "mobile", url: "/secret" }]
  ])("rejects an invalid or additional payload before DB work: %j", async (payload) => {
    const response = await POST(request(JSON.stringify(payload)));

    expect(response.status).toBe(400);
    expect(recordWebVital).not.toHaveBeenCalled();
  });

  it("rejects malformed and over-1KB bodies before DB work", async () => {
    const malformed = await POST(request("{"));
    const oversized = await POST(request(JSON.stringify({
      page: "events",
      name: "LCP",
      value: 10,
      device: "mobile",
      padding: "x".repeat(1024)
    })));

    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(recordWebVital).not.toHaveBeenCalled();
  });

  it("returns Retry-After when the anonymous HMAC subject exceeds its limit", async () => {
    recordWebVital.mockResolvedValue(17);

    const response = await POST(request(JSON.stringify({
      page: "other",
      name: "INP",
      value: 120,
      device: "desktop"
    })));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
  });
});

describe("WebVitalsReporter", () => {
  const sendBeacon = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    hookState.callback = null;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true }))
    });
    window.history.replaceState({}, "", "/events/evt-secret?token=secret");
  });

  it("maps URLs to a fixed coarse page allowlist", () => {
    expect(mapPathnameToPageTemplate("/")).toBe("home");
    expect(mapPathnameToPageTemplate("/events")).toBe("events");
    expect(mapPathnameToPageTemplate("/events/evt-secret")).toBe("event-detail");
    expect(mapPathnameToPageTemplate("/calendar")).toBe("calendar");
    expect(mapPathnameToPageTemplate("/connections")).toBe("connections");
    expect(mapPathnameToPageTemplate("/settings")).toBe("other");
  });

  it("decides the 5% sample once and sends only an allowed coarse payload", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.049);
    const view = render(<WebVitalsReporter />);
    view.rerender(<WebVitalsReporter />);

    expect(random).toHaveBeenCalledTimes(1);
    act(() => hookState.callback?.({ name: "LCP", value: 2300 }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith(
      "/api/performance/vitals",
      JSON.stringify({
        page: "event-detail",
        name: "LCP",
        value: 2300,
        device: "mobile"
      })
    );
    expect(JSON.stringify(sendBeacon.mock.calls)).not.toMatch(/evt-secret|token=|pathname|url/i);
  });

  it("does not send outside the sample or for unsupported metrics", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    render(<WebVitalsReporter />);
    act(() => hookState.callback?.({ name: "LCP", value: 1000 }));
    expect(sendBeacon).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    render(<WebVitalsReporter />);
    act(() => hookState.callback?.({ name: "FCP", value: 100 }));
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe("safe server timing", () => {
  it("rejects an unbounded operation before running or logging it", async () => {
    const fn = vi.fn(async () => "result");

    await expect(timed("https://secret.example/events/1" as never, fn))
      .rejects.toThrow("Unsupported timed operation");

    expect(fn).not.toHaveBeenCalled();
    expect(safeLog).not.toHaveBeenCalled();
  });

  it("logs only a bounded operation and elapsed milliseconds", async () => {
    await expect(timed("performance.web_vital.record", async () => "private-result"))
      .resolves.toBe("private-result");

    expect(safeLog).toHaveBeenCalledWith({
      operation: "performance.web_vital.record",
      durationMs: expect.any(Number)
    });
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("private-result");
  });

  it("rethrows failures without logging error contents", async () => {
    const error = new Error("must-not-be-logged");
    await expect(timed("performance.web_vital.record", async () => {
      throw error;
    })).rejects.toBe(error);

    expect(safeLog).toHaveBeenCalledWith(expect.objectContaining({
      operation: "performance.web_vital.record",
      durationMs: expect.any(Number)
    }));
    expect(safeLog.mock.calls.at(-1)?.[0]).not.toHaveProperty("code");
    expect(safeLog.mock.calls.at(-1)?.[0]).not.toHaveProperty("status");
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("must-not-be-logged");
  });

  it.each([
    "events.list",
    "calendar.list",
    "connections.load",
    "event-detail.load"
  ] as const)("allows the bounded page-load operation %s", async (operation) => {
    await timed(operation, async () => undefined);

    expect(safeLog).toHaveBeenLastCalledWith({
      operation,
      durationMs: expect.any(Number)
    });
  });
});
