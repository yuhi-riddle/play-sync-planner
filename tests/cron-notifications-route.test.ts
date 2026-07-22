import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCronNotifications, hasSupabaseAdminEnv } = vi.hoisted(() => ({
  createCronNotifications: vi.fn(),
  hasSupabaseAdminEnv: vi.fn()
}));

vi.mock("@/lib/server/admin/cron-notifications", () => ({ createCronNotifications }));
vi.mock("@/lib/supabase/server", () => ({ hasSupabaseAdminEnv }));

import { GET } from "@/app/api/cron/notifications/route";

const originalSecret = process.env.CRON_SECRET;

function request(headers?: HeadersInit) {
  return new NextRequest("http://localhost/api/cron/notifications", { headers });
}

describe("cron notification authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasSupabaseAdminEnv.mockReturnValue(true);
    createCronNotifications.mockResolvedValue(3);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("fails closed without CRON_SECRET and never reaches the admin wrapper", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(createCronNotifications).not.toHaveBeenCalled();
  });

  it("does not accept the Vercel cron user-agent as an authorization fallback", async () => {
    process.env.CRON_SECRET = "required-cron-secret";

    const response = await GET(request({ "user-agent": "vercel-cron/1.0" }));

    expect(response.status).toBe(401);
    expect(createCronNotifications).not.toHaveBeenCalled();
  });

  it("accepts only the exact bearer secret", async () => {
    process.env.CRON_SECRET = "required-cron-secret";

    const response = await GET(request({
      authorization: "Bearer required-cron-secret",
      "user-agent": "anything"
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ created: 3 });
    expect(createCronNotifications).toHaveBeenCalledTimes(1);
  });
});
