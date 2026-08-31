// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies, createSupabaseServerClient, getCurrentUser, getCurrentActiveUser } = vi.hoisted(() => ({
  cookies: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getCurrentActiveUser: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser, getCurrentActiveUser }));

import { GET as connect } from "@/app/api/google-calendar/connect/route";
import { GET as callback } from "@/app/api/google-calendar/callback/route";
import { POST as disconnect } from "@/app/api/google-calendar/disconnect/route";
import { GET as freebusy } from "@/app/api/google-calendar/freebusy/route";

const withdrawnUser = {
  id: "11111111-1111-1111-1111-111111111111",
  app_metadata: { withdrawn_at: "2026-07-27T00:00:00.000Z" },
  user_metadata: {}
};

describe("退会済みユーザーのGoogle Calendar API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(withdrawnUser);
    getCurrentActiveUser.mockResolvedValue(null);
    cookies.mockResolvedValue({ get: vi.fn(), delete: vi.fn(), set: vi.fn() });
  });

  it.each([
    ["connect", () => connect(new NextRequest("https://example.com/api/google-calendar/connect"))],
    ["callback", () => callback(new NextRequest("https://example.com/api/google-calendar/callback"))],
    ["disconnect", () => disconnect(new Request("https://example.com/api/google-calendar/disconnect", { method: "POST" }))]
  ])("%sはログイン画面(withdrawn=1)へリダイレクトする", async (_name, requestRoute) => {
    const response = await requestRoute();

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("withdrawn=1");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("freebusyは401を返す", async () => {
    const response = await freebusy(
      new NextRequest("https://example.com/api/google-calendar/freebusy?month=2026-08")
    );

    expect(response.status).toBe(401);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
