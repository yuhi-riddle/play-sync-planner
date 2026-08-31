// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies, exchangeGoogleCalendarCode, createSupabaseServerClient, getCurrentUser, encryptToken } = vi.hoisted(() => ({
  cookies: vi.fn(),
  exchangeGoogleCalendarCode: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
  encryptToken: vi.fn((v: string) => `enc(${v})`)
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/google-calendar/token-crypto", () => ({ encryptToken }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, getCurrentUser }));
vi.mock("@/lib/google-calendar/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-calendar/oauth")>();
  return { ...actual, exchangeGoogleCalendarCode };
});

import { GET } from "@/app/api/google-calendar/callback/route";

function idToken(email: string) {
  const payload = Buffer.from(JSON.stringify({ email })).toString("base64url");
  return `header.${payload}.sig`;
}

describe("google-calendar callback: account_email", () => {
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    upsert = vi.fn(async () => ({ error: null }));
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "login-address@gmail.com", app_metadata: {} });
    cookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "madoi_calendar_oauth_state" ? { value: "state-1" } : { value: "/settings" }
      ),
      delete: vi.fn()
    });
    createSupabaseServerClient.mockResolvedValue({ from: () => ({ upsert }) });
  });

  it("id_token のメールを account_email に保存する（ログイン用アドレスではなく）", async () => {
    exchangeGoogleCalendarCode.mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
      id_token: idToken("calendar-account@workspace.example")
    });

    await GET(new NextRequest("https://example.com/api/google-calendar/callback?code=c&state=state-1"));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_email: "calendar-account@workspace.example" }),
      expect.anything()
    );
  });

  it("id_token が無ければログイン用アドレスにフォールバックする", async () => {
    exchangeGoogleCalendarCode.mockResolvedValue({ access_token: "a", refresh_token: "r", expires_in: 3600 });

    await GET(new NextRequest("https://example.com/api/google-calendar/callback?code=c&state=state-1"));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ account_email: "login-address@gmail.com" }),
      expect.anything()
    );
  });
});
