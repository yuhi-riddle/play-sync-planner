import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  hasSupabaseAdminEnv: () => false
}));

import { GET } from "@/app/api/cron/notifications/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/cron/notifications", { headers });
}

describe("GET /api/cron/notifications authorization", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
  });

  it("rejects a request with a spoofed vercel-cron user-agent when CRON_SECRET is unset", async () => {
    const response = await GET(request({ "user-agent": "vercel-cron/1.0" }));

    expect(response.status).toBe(401);
  });

  it("rejects requests with no credentials at all", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
  });

  it("accepts a request with the correct CRON_SECRET bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "test-secret");

    const response = await GET(request({ authorization: "Bearer test-secret" }));

    expect(response.status).not.toBe(401);
  });
});
