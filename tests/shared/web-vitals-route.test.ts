// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn()
}));

import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

import { POST } from "@/app/api/performance/vitals/route";

function requestWithBody(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/performance/vitals", {
    method: "POST",
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), ...headers }
  });
}

function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<
    typeof createSupabaseAdminClient
  >);
  return rpc;
}

describe("POST /api/performance/vitals", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to console.info when Supabase admin env is not configured", async () => {
    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1234.5, device: "mobile" })
    );

    expect(response.status).toBe(204);
    expect(console.info).toHaveBeenCalledWith(
      "[web-vitals]",
      expect.objectContaining({ page: "home", name: "LCP", value: 1234.5, device: "mobile" })
    );
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("saves the metric via the record_web_vital RPC when Supabase admin env is configured", async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true);
    const rpc = mockRpc({ data: { accepted: true }, error: null });

    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1234.5, device: "mobile" })
    );

    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("record_web_vital", {
      p_page_template: "home",
      p_metric_name: "LCP",
      p_metric_value: 1234.5,
      p_device_class: "mobile",
      p_client_ip: null
    });
  });

  it("extracts the first address from x-forwarded-for as the client ip", async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true);
    const rpc = mockRpc({ data: { accepted: true }, error: null });

    await POST(
      requestWithBody(
        { page: "home", name: "LCP", value: 1, device: "mobile" },
        { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }
      )
    );

    expect(rpc).toHaveBeenCalledWith(
      "record_web_vital",
      expect.objectContaining({ p_client_ip: "203.0.113.5" })
    );
  });

  it("returns 429 with Retry-After when the rate limit rejects the request", async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true);
    mockRpc({ data: { accepted: false, retry_after_seconds: 42 }, error: null });

    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1, device: "mobile" })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("returns 500 when the RPC call errors", async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true);
    mockRpc({ data: null, error: { message: "boom" } });

    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1, device: "mobile" })
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when the RPC response has an unexpected shape", async () => {
    vi.mocked(hasSupabaseAdminEnv).mockReturnValue(true);
    mockRpc({ data: { foo: 1 }, error: null });

    const response = await POST(
      requestWithBody({ page: "home", name: "LCP", value: 1, device: "mobile" })
    );

    expect(response.status).toBe(500);
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
