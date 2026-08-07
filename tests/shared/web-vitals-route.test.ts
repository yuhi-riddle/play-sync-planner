// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/performance/vitals/route";

function requestWithBody(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/performance/vitals", {
    method: "POST",
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), ...headers }
  });
}

describe("POST /api/performance/vitals", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a valid metric and returns 204 with no body", async () => {
    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1234.5, device: "mobile" })
    );

    expect(response.status).toBe(204);
    expect(console.info).toHaveBeenCalledWith(
      "[web-vitals]",
      expect.objectContaining({ page: "home", name: "LCP", value: 1234.5, device: "mobile" })
    );
  });

  it("rejects an unknown metric name", async () => {
    const response = await POST(requestWithBody({ page: "home", name: "FCP", value: 1, device: "mobile" }));

    expect(response.status).toBe(400);
  });

  it("rejects a CLS value outside the plausible range", async () => {
    const response = await POST(requestWithBody({ page: "home", name: "CLS", value: 999, device: "mobile" }));

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(requestWithBody("not json"));

    expect(response.status).toBe(400);
  });

  it("rejects a body larger than the declared limit", async () => {
    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1, device: "mobile" }, { "content-length": "999999" })
    );

    expect(response.status).toBe(413);
  });
});
